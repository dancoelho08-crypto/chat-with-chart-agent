export default function handler(req, res) {
  res.status(200).json({
    message: "Hello from your Vercel backend",
    timestamp: new Date().toISOString(),
    method: req.method
  });
}
