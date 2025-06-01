// ActivityPub Broadcast Bot for Cloudflare Workers
// Inspired by https://github.com/wxwmoe/wxwClub

// Constants and types
const CONTENT_TYPE_HEADER = 'application/activity+json';
const ACCEPT_HEADER = 'application/activity+json, application/ld+json';
const DEFAULT_ACTOR_NAME = 'Broadcast Bot';
const DEFAULT_ACTOR_ICON = 'https://mastodon.social/avatars/original/missing.png';

// Helper functions
function generateKeyId(domain) {
  return `https://${domain}/actor#main-key`;
}

function generateActorId(domain) {
  return `https://${domain}/actor`;
}

function parseHandle(mention) {
  const match = mention.match(/@([^@]+)@(.+)/);
  return match ? { username: match[1], domain: match[2] } : null;
}

function buildActorObject(domain, pubkey) {
  const actorName = ACTOR_NAME || DEFAULT_ACTOR_NAME;
  const actorIcon = ACTOR_ICON || DEFAULT_ACTOR_ICON;
  
  return {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    'id': generateActorId(domain),
    'type': 'Person',
    'preferredUsername': 'board',
    'name': actorName,
    'summary': 'A broadcast bot that forwards mentions to all followers',
    'inbox': `https://${domain}/inbox`,
    'outbox': `https://${domain}/outbox`,
    'followers': `https://${domain}/followers`,
    'following': `https://${domain}/following`,
    'icon': {
      'type': 'Image',
      'mediaType': 'image/png',
      'url': actorIcon
    },
    'publicKey': {
      'id': generateKeyId(domain),
      'owner': generateActorId(domain),
      'publicKeyPem': PUBLIC_KEY_PEM
    }
  };
}

async function verifySignature(request, body) {
  try {
    const signature = request.headers.get('signature');
    if (!signature) return false;

    // Basic signature verification logic
    // In a production environment, you should implement proper HTTP Signature verification
    return true;
  } catch (error) {
    return false;
  }
}

async function createNote(domain, activity) {
  const actor = activity.actor;
  const object = activity.object;
  
  if (!object || !object.content) return null;

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    'id': `https://${domain}/notes/${Date.now()}`,
    'type': 'Note',
    'published': new Date().toISOString(),
    'attributedTo': generateActorId(domain),
    'content': `Forwarded from ${actor}:\n\n${object.content}`,
    'to': ['https://www.w3.org/ns/activitystreams#Public']
  };
}

async function broadcastToFollowers(domain, activity, followers) {
  const note = await createNote(domain, activity);
  if (!note) return;

  const announce = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    'id': `https://${domain}/activities/${Date.now()}`,
    'type': 'Announce',
    'actor': generateActorId(domain),
    'object': note,
    'to': ['https://www.w3.org/ns/activitystreams#Public'],
    'cc': followers
  };

  // In a production environment, you should implement proper delivery to followers
  return announce;
}

// Main request handler
async function handleRequest(request) {
  const url = new URL(request.url);
  const domain = DOMAIN;
  
  // Handle actor profile request
  if (url.pathname === '/actor' && request.method === 'GET') {
    return new Response(
      JSON.stringify(buildActorObject(domain, PUBLIC_KEY_PEM)),
      {
        headers: {
          'Content-Type': CONTENT_TYPE_HEADER,
          'Cache-Control': 'max-age=0, private, must-revalidate'
        }
      }
    );
  }

  // Handle inbox
  if (url.pathname === '/inbox' && request.method === 'POST') {
    const body = await request.json();
    
    if (!await verifySignature(request, body)) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (body.type === 'Follow') {
      const followerId = body.actor;
      await FOLLOWERS.put(followerId, 'active');
      
      const accept = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        'id': `https://${domain}/activities/${Date.now()}`,
        'type': 'Accept',
        'actor': generateActorId(domain),
        'object': body
      };

      return new Response(JSON.stringify(accept), {
        headers: { 'Content-Type': CONTENT_TYPE_HEADER }
      });
    }

    if (body.type === 'Create' && body.object?.type === 'Note') {
      const followers = await FOLLOWERS.list();
      const followerIds = followers.keys.map(key => key.name);
      
      const broadcast = await broadcastToFollowers(domain, body, followerIds);
      
      return new Response(JSON.stringify(broadcast), {
        headers: { 'Content-Type': CONTENT_TYPE_HEADER }
      });
    }

    return new Response('OK');
  }

  // Handle webfinger
  if (url.pathname === '/.well-known/webfinger') {
    const resource = url.searchParams.get('resource');
    if (!resource?.startsWith('acct:')) {
      return new Response('Bad Request', { status: 400 });
    }

    const handle = parseHandle(resource.substring(5));
    if (!handle || handle.domain !== domain) {
      return new Response('Not Found', { status: 404 });
    }

    const response = {
      'subject': `acct:board@${domain}`,
      'links': [
        {
          'rel': 'self',
          'type': CONTENT_TYPE_HEADER,
          'href': generateActorId(domain)
        }
      ]
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/jrd+json',
        'Cache-Control': 'max-age=0, private, must-revalidate'
      }
    });
  }

  return new Response('Not Found', { status: 404 });
}

// Register the worker
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
