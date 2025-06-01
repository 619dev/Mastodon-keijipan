export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/.well-known/webfinger') {
      const resource = url.searchParams.get('resource');
      const name = resource?.split(':')[1];
      return new Response(
        JSON.stringify({
          subject: `acct:${name}@${env.DOMAIN}`,
          links: [
            {
              rel: 'self',
              type: 'application/activity+json',
              href: `https://${env.DOMAIN}/users/${name}`,
            },
          ],
        }),
        {
          headers: { 'Content-Type': 'application/jrd+json' },
        }
      );
    }

    if (url.pathname === `/users/${env.ACTOR_NAME}`) {
      return new Response(
        JSON.stringify({
          '@context': [
            'https://www.w3.org/ns/activitystreams',
            'https://w3id.org/security/v1',
          ],
          id: `https://${env.DOMAIN}/users/${env.ACTOR_NAME}`,
          type: 'Person',
          preferredUsername: env.ACTOR_NAME,
          name: env.ACTOR_NAME || 'Broadcast Bot',
          inbox: `https://${env.DOMAIN}/inbox`,
          outbox: `https://${env.DOMAIN}/outbox`,
          followers: `https://${env.DOMAIN}/followers`,
          publicKey: {
            id: `https://${env.DOMAIN}/users/${env.ACTOR_NAME}#main-key`,
            owner: `https://${env.DOMAIN}/users/${env.ACTOR_NAME}`,
            publicKeyPem: env.PUBLIC_KEY_PEM,
          },
          icon: {
            type: 'Image',
            mediaType: 'image/png',
            url: env.ACTOR_ICON,
          },
        }),
        {
          headers: { 'Content-Type': 'application/activity+json' },
        }
      );
    }

    if (url.pathname === '/inbox' && request.method === 'POST') {
      try {
        const activity = await request.json();
        console.log('Activity received:', JSON.stringify(activity, null, 2));

        if (activity.type === 'Follow' && activity.actor) {
          // fetch actor's inbox URL
          const actorRes = await fetch(activity.actor, {
            headers: { Accept: 'application/activity+json' },
          });
          const actor = await actorRes.json();

          if (actor.inbox) {
            await env.FOLLOWERS.put(actor.id, actor.inbox);
            console.log(`✅ Stored follower: ${actor.id} => ${actor.inbox}`);
          } else {
            console.log('❌ Actor inbox not found:', actor);
          }
        }
      } catch (err) {
        console.log('❌ Failed to process inbox request:', err);
      }
      return new Response(null, { status: 202 });
    }

    if (url.pathname === '/outbox') {
      return new Response(
        JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: `https://${env.DOMAIN}/outbox`,
          type: 'OrderedCollection',
          totalItems: 0,
          orderedItems: [],
        }),
        {
          headers: { 'Content-Type': 'application/activity+json' },
        }
      );
    }

    if (url.pathname === '/followers') {
      return new Response(
        JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: `https://${env.DOMAIN}/followers`,
          type: 'OrderedCollection',
          totalItems: 0,
          orderedItems: [],
        }),
        {
          headers: { 'Content-Type': 'application/activity+json' },
        }
      );
    }

    return new Response('Not found', { status: 404 });
  },
};
