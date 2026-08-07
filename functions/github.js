export async function onRequest(context) {
  const token = context.env.GH_PAT;
  const body = await context.request.json();
  
  const res = await fetch(`https://api.github.com/repos/${body.path}`, {
    method: body.method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: body.body ? JSON.stringify(body.body) : null,
  });
  return res;
}
