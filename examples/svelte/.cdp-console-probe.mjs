import WebSocket from 'ws';

const url = process.argv[2];
const deadline = Date.now() + 20000;

function connect() {
  const ws = new WebSocket(url, { headers: { Origin: 'http://localhost:8081' } });
  let id = 1;
  const send = (method, params = {}) => ws.send(JSON.stringify({ id: id++, method, params }));

  ws.on('open', () => {
    console.log('[connected]');
    send('Runtime.enable');
    send('Log.enable');
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? JSON.stringify(a))
        .join(' ');
      console.log(`[console.${msg.params.type}] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.log('[EXCEPTION]', JSON.stringify(msg.params.exceptionDetails));
    } else if (msg.method === 'Log.entryAdded') {
      console.log('[log-entry]', JSON.stringify(msg.params.entry));
    }
  });

  ws.on('error', (err) => {
    console.log('[ws-error]', err.message);
    if (Date.now() < deadline) setTimeout(connect, 200);
  });

  ws.on('close', () => {
    if (Date.now() < deadline) setTimeout(connect, 200);
  });
}

connect();
setTimeout(() => {
  console.log('--- done listening ---');
  process.exit(0);
}, 20000);
