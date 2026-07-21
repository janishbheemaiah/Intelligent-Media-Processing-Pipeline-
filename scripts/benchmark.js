const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

// Make sure the server is running on port 3000 before running this script
// npm run dev

const sampleImagePath = path.join(__dirname, '../sample-images/valid-plate.jpg');
// Create dummy file if it doesn't exist just for load testing
if (!fs.existsSync(path.join(__dirname, '../sample-images'))) {
  fs.mkdirSync(path.join(__dirname, '../sample-images'));
}
if (!fs.existsSync(sampleImagePath)) {
  fs.writeFileSync(sampleImagePath, 'dummy content');
}

console.log('Starting Benchmark...');
console.log('Testing /analytics endpoint (Read-heavy)...');

const analyticsTest = autocannon({
  url: 'http://localhost:3000/analytics',
  connections: 50,
  duration: 5,
}, (err, res) => {
  if (err) console.error(err);
  console.log('--- Analytics Endpoint Results ---');
  console.log(`Requests/sec: ${res.requests.average}`);
  console.log(`Latency P99: ${res.latency.p99} ms`);
  console.log(`Errors: ${res.errors}`);
  
  console.log('\nTesting /upload endpoint (Write-heavy)...');
  
  // Create a multipart form buffer for load testing
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const data = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="valid-plate.jpg"\r\nContent-Type: image/jpeg\r\n\r\ndummy content\r\n--${boundary}--`;
  
  const uploadTest = autocannon({
    url: 'http://localhost:3000/upload',
    connections: 10, // lower connections to simulate real uploads without crashing disk io immediately
    duration: 5,
    method: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`
    },
    body: data
  }, (err2, res2) => {
    if (err2) console.error(err2);
    console.log('--- Upload Endpoint Results ---');
    console.log(`Requests/sec: ${res2.requests.average}`);
    console.log(`Latency P99: ${res2.latency.p99} ms`);
    console.log(`Errors: ${res2.errors}`); // Might hit rate limiter!
    console.log(`Non-2xx Responses: ${res2.non2xx}`); // Rate limits will show up here as 429
  });
});
