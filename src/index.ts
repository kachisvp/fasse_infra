import http from "http";

const HOSTNAME = "localhost";
const PORT = 3000;

const server = http.createServer((req, res) => {
  let html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="description" content="resize">
        <meta name="robots" content="none">
        <title>Hello TypeScript</title>
        <!-- <link rel="icon" href="favicon.ico" /> -->
        <link rel="stylesheet" href="./css/normalize.css" />
        <style>
            *,
            *::before,
            *::after {
                box-sizing: border-box;
            }
        </style>
    </head>
    <body>
    </body>
    </html>
  `
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end("ok");
});

server.listen(PORT, HOSTNAME, () => {
  console.log(`Server running at http://${HOSTNAME}:${PORT}`);
});
