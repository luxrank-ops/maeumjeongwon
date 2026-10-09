'use strict';

const crypto = require('crypto');
const { createApp } = require('./server/app');

let SESSION_SECRET = process.env.SESSION_SECRET || '';
if (!SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('SESSION_SECRET이 없어요. 운영에서는 32자 이상의 비밀값을 설정해야 시작할 수 있어요.');
    process.exit(1);
  }
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
}

const PORT = Number(process.env.PORT) || 3000;
const app = createApp({ secret: SESSION_SECRET });

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
