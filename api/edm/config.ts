export default function handler(_req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  const maxCount = parseInt(process.env.EDM_MAX_UPLOAD_COUNT || '5', 10);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ maxCount }));
}
