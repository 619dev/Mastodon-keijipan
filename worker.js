// ActivityPub Broadcast Bot for Cloudflare Workers
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

function buildActorObject(domain) {
  const actorName = ACTOR_NAME || DEFAULT_ACTOR_NAME;
  const actorIcon = ACTOR_ICON || DEFAULT_ACTOR_ICON;
  const actorId = generateActorId(domain);
  
  return {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
      {
        'toot': 'http://joinmastodon.org/ns#',
        'discoverable': 'toot:discoverable',
        'featured': 'toot:featured',
        'alsoKnownAs': 'as:alsoKnownAs',
        'movedTo': 'as:movedTo',
        'schema': 'http://schema.org#',
        'PropertyValue': 'schema:PropertyValue',
        'value': 'schema:value'
      }
    ],
    'id': actorId,
    'type': 'Person',
    'preferredUsername': 'board',
    'name': actorName,
    'discoverable': true,
    'published': new Date().toISOString(),
    'summary': 'A broadcast bot that forwards mentions to all followers',
    'url': actorId,
    'manuallyApprovesFollowers': false,
    'inbox': `https://${domain}/inbox`,
    'outbox': `https://${domain}/outbox`,
    'followers': `https://${domain}/followers`,
    'following': `https://${domain}/following`,
    'featured': `https://${domain}/featured`,
    'icon': {
      'type': 'Image',
      'mediaType': 'image/png',
      'url': actorIcon
    },
    'image': {
      'type': 'Image',
      'mediaType': 'image/png',
      'url': actorIcon
    },
    'endpoints': {
      'sharedInbox': `https://${domain}/inbox`
    },
    'publicKey': {
      'id': generateKeyId(domain),
      'owner': actorId,
      'publicKeyPem': PUBLIC_KEY_PEM
    },
    'attachment': [
      {
        'type': 'PropertyValue',
        'name': 'Bot Type',
        'value': 'Broadcast Bot'
      },
      {
        'type': 'PropertyValue',
        'name': 'Description',
        'value': 'A bot that broadcasts messages to all followers'
      }
    ],
    'tag': [],
    'devices': `https://${domain}/devices`
  };
}

async function generateSignature(privateKey, method, targetHost, path, date, digest) {
  const signingString = `(request-target): ${method.toLowerCase()} ${path}\nhost: ${targetHost}\ndate: ${date}\ndigest: ${digest}`;
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(signingString);
    
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = privateKey.replace(/[\r\n]/g, '')
      .replace(pemHeader, '')
      .replace(pemFooter, '');
    
    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    const privateKeyObject = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKeyObject,
      data
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  } catch (error) {
    console.error('Error generating signature:', error);
    throw error;
  }
}

async function signRequest(method, targetUrl, body) {
  const date = new Date().toUTCString();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(body))
  );
  const digestHeader = 'SHA-256=' + btoa(String.fromCharCode(...new Uint8Array(digest)));
  
  const signature = await generateSignature(
    PRIVATE_KEY_PEM,
    method,
    targetUrl.host,
    targetUrl.pathname,
    date,
    digestHeader
  );

  return {
    'Host': targetUrl.host,
    'Date': date,
    'Digest': digestHeader,
    'Signature': `keyId="${generateKeyId(DOMAIN)}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`,
    'Accept': ACCEPT_HEADER,
    'Content-Type': CONTENT_TYPE_HEADER,
    'User-Agent': 'ActivityPub-Broadcast-Bot/1.0.0'
  };
}

async function deliverToInbox(activity, targetInbox) {
  try {
    const targetUrl = new URL(targetInbox);
    const headers = await signRequest('POST', targetUrl, activity);

    console.log(`Delivering to inbox ${targetInbox}`);
    console.log('Activity:', JSON.stringify(activity));
    console.log('Headers:', JSON.stringify(headers));

    const response = await fetch(targetInbox, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(activity)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to deliver to ${targetInbox}. Status: ${response.status}, Error: ${errorText}`);
      return false;
    }

    console.log(`Successfully delivered to ${targetInbox}`);
    return true;
  } catch (error) {
    console.error(`Failed to deliver to ${targetInbox}:`, error);
    return false;
  }
}

async function createNote(domain, activity) {
  const actor = activity.actor;
  const object = activity.object;
  
  if (!object || !object.content) return null;

  let actorInfo;
  try {
    const actorResponse = await fetch(actor, {
      headers: { 
        'Accept': ACCEPT_HEADER,
        'User-Agent': 'ActivityPub-Broadcast-Bot/1.0.0'
      }
    });
    if (actorResponse.ok) {
      actorInfo = await actorResponse.json();
    }
  } catch (error) {
    console.error('Error fetching actor info:', error);
  }

  const noteId = `https://${domain}/notes/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const username = actorInfo ? actorInfo.preferredUsername : new URL(actor).pathname.split('/').pop();
  const actorDomain = new URL(actor).host;
  const messageContent = `RT @${username}@${actorDomain}\n\n${object.content}`;
  
  return {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    'id': noteId,
    'type': 'Note',
    'published': new Date().toISOString(),
    'attributedTo': generateActorId(domain),
    'content': messageContent,
    'to': ['https://www.w3.org/ns/activitystreams#Public'],
    'cc': [],
    'sensitive': object.sensitive || false,
    'contentMap': object.contentMap || null,
    'attachment': object.attachment || [],
    'tag': [
      {
        'type': 'Mention',
        'href': actor,
        'name': `@${username}@${actorDomain}`
      },
      ...(object.tag || [])
    ],
    'inReplyTo': object.inReplyTo || null,
    'conversation': object.conversation || null,
    'originalAuthor': {
      'type': 'Person',
      'id': actor,
      'name': username,
      'preferredUsername': username,
      'url': actor
    }
  };
}

async function broadcastToFollowers(domain, activity, followers) {
  try {
    const note = await createNote(domain, activity);
    if (!note) {
      console.log('Failed to create note from activity');
      return null;
    }

    const createActivity = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1'
      ],
      'id': `https://${domain}/activities/create/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      'type': 'Create',
      'actor': generateActorId(domain),
      'object': note,
      'to': ['https://www.w3.org/ns/activitystreams#Public'],
      'cc': followers,
      'published': new Date().toISOString()
    };

    console.log('Broadcasting to followers:', followers);
    
    for (const followerId of followers) {
      try {
        console.log(`Fetching actor info for ${followerId}`);
        const followerResponse = await fetch(followerId, {
          headers: {
            'Accept': ACCEPT_HEADER,
            'User-Agent': 'ActivityPub-Broadcast-Bot/1.0.0'
          }
        });
        
        if (!followerResponse.ok) {
          console.error(`Failed to fetch follower info for ${followerId}. Status: ${followerResponse.status}`);
          continue;
        }

        const followerActor = await followerResponse.json();
        const inbox = followerActor.inbox;
        
        if (inbox) {
          console.log(`Delivering to follower inbox: ${inbox}`);
          await deliverToInbox(createActivity, inbox);
        } else {
          console.error(`No inbox found for follower ${followerId}`);
        }
      } catch (error) {
        console.error(`Error processing follower ${followerId}:`, error);
      }
    }

    return createActivity;
  } catch (error) {
    console.error('Error in broadcastToFollowers:', error);
    return null;
  }
}

// Main request handler
async function handleRequest(request) {
  const url = new URL(request.url);
  const domain = DOMAIN;

  console.log(`Handling ${request.method} request to ${url.pathname}`);
  
  // Handle actor profile request
  if (url.pathname === '/actor' && request.method === 'GET') {
    return new Response(
      JSON.stringify(buildActorObject(domain)),
      {
        headers: {
          'Content-Type': CONTENT_TYPE_HEADER,
          'Cache-Control': 'max-age=0, private, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  // Handle inbox
  if (url.pathname === '/inbox' && request.method === 'POST') {
    let body;
    try {
      body = await request.json();
      console.log('Received activity:', JSON.stringify(body));
    } catch (e) {
      console.error('Failed to parse request body:', e);
      return new Response('Invalid JSON', { status: 400 });
    }

    if (body.type === 'Follow') {
      const followerId = body.actor;
      console.log(`Handling Follow request from ${followerId}`);
      
      try {
        await FOLLOWERS.put(followerId, 'active');
        console.log(`Added follower ${followerId} to KV store`);
        
        const accept = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          'id': `https://${domain}/activities/accept/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
          'type': 'Accept',
          'actor': generateActorId(domain),
          'object': body,
          'published': new Date().toISOString()
        };

        try {
          const followerResponse = await fetch(followerId, {
            headers: { 
              'Accept': ACCEPT_HEADER,
              'User-Agent': 'ActivityPub-Broadcast-Bot/1.0.0'
            }
          });
          
          if (followerResponse.ok) {
            const followerActor = await followerResponse.json();
            if (followerActor.inbox) {
              await deliverToInbox(accept, followerActor.inbox);
            }
          }
        } catch (error) {
          console.error('Failed to send Accept:', error);
        }

        return new Response(JSON.stringify(accept), {
          headers: { 
            'Content-Type': CONTENT_TYPE_HEADER,
            'Cache-Control': 'max-age=0, private, must-revalidate'
          }
        });
      } catch (error) {
        console.error('Error handling Follow request:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    if (body.type === 'Create' && body.object?.type === 'Note') {
      console.log('Processing Create activity for Note');
      
      try {
        const { keys } = await FOLLOWERS.list();
        const followerIds = keys.map(key => key.name);
        
        console.log('Found followers:', followerIds);

        if (followerIds.length > 0) {
          const broadcast = await broadcastToFollowers(domain, body, followerIds);
          if (broadcast) {
            console.log('Broadcast created:', JSON.stringify(broadcast));
            return new Response(JSON.stringify(broadcast), {
              headers: { 
                'Content-Type': CONTENT_TYPE_HEADER,
                'Cache-Control': 'max-age=0, private, must-revalidate'
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing Create activity:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
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
      'aliases': [
        generateActorId(domain)
      ],
      'links': [
        {
          'rel': 'self',
          'type': CONTENT_TYPE_HEADER,
          'href': generateActorId(domain)
        },
        {
          'rel': 'http://webfinger.net/rel/profile-page',
          'type': 'text/html',
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

  // Handle nodeinfo
  if (url.pathname === '/.well-known/nodeinfo') {
    const response = {
      'links': [
        {
          'rel': 'http://nodeinfo.diaspora.software/ns/schema/2.0',
          'href': `https://${domain}/nodeinfo/2.0`
        }
      ]
    };
    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=0, private, must-revalidate'
      }
    });
  }

  if (url.pathname === '/nodeinfo/2.0') {
    const response = {
      'version': '2.0',
      'software': {
        'name': 'broadcast-bot',
        'version': '1.0.0'
      },
      'protocols': ['activitypub'],
      'services': {
        'inbound': [],
        'outbound': []
      },
      'usage': {
        'users': {
          'total': 1,
          'activeMonth': 1,
          'activeHalfyear': 1
        },
        'localPosts': 0
      },
      'openRegistrations': false,
      'metadata': {
        'nodeName': ACTOR_NAME || DEFAULT_ACTOR_NAME,
        'nodeDescription': 'A bot that broadcasts messages to all followers'
      }
    };
    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
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
