export default {
  async fetch(request, env, ctx) {
    const { PRIVATE_KEY_PEM, PUBLIC_KEY_PEM, DOMAIN } = env;
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    const ACTOR = `https://${DOMAIN}/actor`;
    const INBOX = `https://${DOMAIN}/inbox`;

    // ========== /.well-known/webfinger ==========
    if (pathname === "/.well-known/webfinger") {
      const resource = url.searchParams.get("resource");
      if (resource !== `acct:board@${DOMAIN}`) {
        return new Response("Not Found", { status: 404 });
      }
      const jrd = {
        subject: `acct:board@${DOMAIN}`,
        links: [
          {
            rel: "self",
            type: "application/activity+json",
            href: ACTOR,
          },
        ],
      };
      return new Response(JSON.stringify(jrd), {
        headers: { "Content-Type": "application/jrd+json" },
      });
    }

    // ========== /actor ==========
    if (pathname === "/actor") {
      const actor = {
        "@context": "https://www.w3.org/ns/activitystreams",
        id: ACTOR,
        type: "Person",
        preferredUsername: "board",
        inbox: INBOX,
        publicKey: {
          id: `${ACTOR}#main-key`,
          owner: ACTOR,
          publicKeyPem: PUBLIC_KEY_PEM,
        },
      };
      return new Response(JSON.stringify(actor), {
        headers: { "Content-Type": "application/activity+json" },
      });
    }

    // ========== /inbox ==========
    if (pathname === "/inbox" && method === "POST") {
      const body = await request.json();

      // basic logging
      console.log("Received inbox activity:", body?.type);

      if (body.type === "Follow") {
        const accept = {
          "@context": "https://www.w3.org/ns/activitystreams",
          id: `${ACTOR}#accept-${crypto.randomUUID()}`,
          type: "Accept",
          actor: ACTOR,
          object: body,
        };

        // Send Accept to follower
        await fetch(body.actor, {
          method: "GET",
          headers: { Accept: "application/activity+json" },
        }).then(res => res.json()).then(async remoteActor => {
          if (!remoteActor.inbox) return;
          await sendSignedRequest(remoteActor.inbox, ACTOR, PRIVATE_KEY_PEM, accept);
        });
      }

      if (body.type === "Create" && body.object?.type === "Note" && body.object.to?.includes("https://www.w3.org/ns/activitystreams#Public")) {
        const note = body.object;

        // Broadcast to all followers (simplified version)
        // You could store followers in a KV store and loop through
        console.log(`Note received: ${note.content}`);
      }

      return new Response("OK", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  }
}

// ========== Helper: HTTP Signature ==========
async function sendSignedRequest(inbox, actor, privateKeyPem, activity) {
  const date = new Date().toUTCString();
  const body = JSON.stringify(activity);
  const digest = await sha256Digest(body);
  const url = new URL(inbox);
  const signatureHeaders = `(request-target): post ${url.pathname}\nhost: ${url.host}\ndate: ${date}\ndigest: SHA-256=${digest}`;
  const signature = await signWithKey(privateKeyPem, signatureHeaders);

  const header = `keyId="${actor}#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`;

  return fetch(inbox, {
    method: "POST",
    headers: {
      Host: url.host,
      Date: date,
      Digest: `SHA-256=${digest}`,
      Signature: header,
      "Content-Type": "application/activity+json",
    },
    body
  });
}

// ========== Helper: Hash ==========
async function sha256Digest(body) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

// ========== Helper: Sign ==========
async function signWithKey(privateKeyPem, data) {
  const keyData = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const rawKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    rawKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(data)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}
