// server/pg-wire.cjs — 纯原生 Node.js PostgreSQL v3 Wire Protocol 客户端（零外部 npm 依赖）
// 支持 trust / cleartext / md5 认证与完整的大报文分片重组，用于连接本地 PostgreSQL + PostGIS (127.0.0.1:5432)

const net = require('net');
const crypto = require('crypto');

function md5(bufOrStr) {
  return crypto.createHash('md5').update(bufOrStr).digest('hex');
}

function escapeLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') val = JSON.stringify(val);
  const str = String(val);
  return "'" + str.replace(/'/g, "''") + "'";
}

function formatSql(sql, params = []) {
  if (!params || !params.length) return sql;
  return sql.replace(/\$(\d+)/g, (_, idx) => {
    const i = parseInt(idx, 10) - 1;
    return i >= 0 && i < params.length ? escapeLiteral(params[i]) : 'NULL';
  });
}

function buildStartupMessage(user, database) {
  const params = [
    'user', user,
    'database', database,
    'client_encoding', 'UTF8',
  ];
  const bodyStr = params.join('\0') + '\0\0';
  const bodyBuf = Buffer.from(bodyStr, 'utf8');
  const len = 4 + 4 + bodyBuf.length;
  const buf = Buffer.alloc(len);
  buf.writeInt32BE(len, 0);
  buf.writeInt32BE(196608, 4); // Protocol v3.0 (0x00030000)
  bodyBuf.copy(buf, 8);
  return buf;
}

function buildQueryMessage(sql) {
  const sqlBuf = Buffer.from(sql + '\0', 'utf8');
  const len = 4 + sqlBuf.length;
  const buf = Buffer.alloc(1 + len);
  buf.write('Q', 0, 'ascii');
  buf.writeInt32BE(len, 1);
  sqlBuf.copy(buf, 5);
  return buf;
}

function buildPasswordMessage(password) {
  const pwBuf = Buffer.from(password + '\0', 'utf8');
  const len = 4 + pwBuf.length;
  const buf = Buffer.alloc(1 + len);
  buf.write('p', 0, 'ascii');
  buf.writeInt32BE(len, 1);
  pwBuf.copy(buf, 5);
  return buf;
}

function buildTerminateMessage() {
  const buf = Buffer.alloc(5);
  buf.write('X', 0, 'ascii');
  buf.writeInt32BE(4, 1);
  return buf;
}

class PgClient {
  constructor(config = {}) {
    this.host = config.host || process.env.PGHOST || '127.0.0.1';
    this.port = Number(config.port || process.env.PGPORT || 5432);
    this.user = config.user || process.env.PGUSER || 'postgres';
    this.password = config.password ?? process.env.PGPASSWORD ?? '';
    this.database = config.database || process.env.PGDATABASE || 'postgres';
    this.timeout = config.timeout || 6000;
  }

  query(sql, params = []) {
    const finalSql = formatSql(sql, params);
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;
      let rxBuf = Buffer.alloc(0);
      let state = 'AUTH'; // 'AUTH' -> 'READY' -> 'QUERY'
      let fields = [];
      let rows = [];
      let commandTag = '';
      let queryError = null;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(new Error(`PostgreSQL connection timeout (${this.host}:${this.port})`));
        }
      }, this.timeout);

      const finish = (err, res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { socket.write(buildTerminateMessage()); } catch (e) {}
        socket.end();
        if (err) reject(err);
        else resolve(res);
      };

      socket.on('error', (err) => finish(err));
      socket.on('close', () => {
        if (!settled) finish(queryError || new Error('Connection closed unexpectedly'));
      });

      socket.connect(this.port, this.host, () => {
        socket.write(buildStartupMessage(this.user, this.database));
      });

      socket.on('data', (chunk) => {
        rxBuf = Buffer.concat([rxBuf, chunk]);
        while (rxBuf.length >= 5) {
          const msgType = String.fromCharCode(rxBuf[0]);
          const msgLen = rxBuf.readInt32BE(1);
          if (rxBuf.length < 1 + msgLen) break; // 等待完整帧
          const payload = rxBuf.subarray(5, 1 + msgLen);
          rxBuf = rxBuf.subarray(1 + msgLen);

          if (msgType === 'R') {
            const authCode = payload.readInt32BE(0);
            if (authCode === 0) {
              // AuthenticationOk
            } else if (authCode === 3) {
              // CleartextPassword
              socket.write(buildPasswordMessage(this.password));
            } else if (authCode === 5) {
              // MD5Password
              const salt = payload.subarray(4, 8);
              const inner = md5(this.password + this.user);
              const outer = 'md5' + md5(Buffer.concat([Buffer.from(inner, 'ascii'), salt]));
              socket.write(buildPasswordMessage(outer));
            } else {
              return finish(new Error(`Unsupported PostgreSQL auth code: ${authCode}`));
            }
          } else if (msgType === 'Z') {
            if (state === 'AUTH') {
              state = 'QUERY';
              socket.write(buildQueryMessage(finalSql));
            } else if (state === 'QUERY') {
              if (queryError) return finish(queryError);
              return finish(null, { rows, fields, command: commandTag, rowCount: rows.length });
            }
          } else if (msgType === 'T') {
            // RowDescription
            const numFields = payload.readInt16BE(0);
            fields = [];
            let offset = 2;
            for (let i = 0; i < numFields; i++) {
              const nul = payload.indexOf(0, offset);
              const name = payload.toString('utf8', offset, nul);
              const typeOid = payload.readInt32BE(nul + 7);
              fields.push({ name, typeOid });
              offset = nul + 19;
            }
          } else if (msgType === 'D') {
            // DataRow
            const numCols = payload.readInt16BE(0);
            const row = {};
            let offset = 2;
            for (let i = 0; i < numCols; i++) {
              const colLen = payload.readInt32BE(offset);
              offset += 4;
              const colName = fields[i] ? fields[i].name : `col_${i}`;
              if (colLen === -1) {
                row[colName] = null;
              } else {
                const raw = payload.toString('utf8', offset, offset + colLen);
                offset += colLen;
                const oid = fields[i] ? fields[i].typeOid : 0;
                // 自动转换数值与布尔/JSON类型 (INT2=21, INT4=23, INT8=20, FLOAT4=700, FLOAT8=701, NUMERIC=1700, BOOL=16, JSON=114, JSONB=3802)
                if (oid === 21 || oid === 23 || oid === 20 || oid === 700 || oid === 701 || oid === 1700) {
                  const n = Number(raw);
                  row[colName] = Number.isNaN(n) ? raw : n;
                } else if (oid === 16) {
                  row[colName] = raw === 't' || raw === 'true';
                } else if (oid === 114 || oid === 3802) {
                  try { row[colName] = JSON.parse(raw); } catch (e) { row[colName] = raw; }
                } else {
                  row[colName] = raw;
                }
              }
            }
            rows.push(row);
          } else if (msgType === 'C') {
            commandTag = payload.toString('utf8', 0, payload.length - 1);
          } else if (msgType === 'E') {
            // ErrorResponse
            let errMsg = 'PostgreSQL Error';
            let offset = 0;
            while (offset < payload.length && payload[offset] !== 0) {
              const code = String.fromCharCode(payload[offset]);
              const nul = payload.indexOf(0, offset + 1);
              const val = payload.toString('utf8', offset + 1, nul);
              if (code === 'M') errMsg = val;
              offset = nul + 1;
            }
            queryError = new Error(errMsg);
            if (state === 'AUTH') return finish(queryError);
          }
        }
      });
    });
  }
}

module.exports = { PgClient, escapeLiteral, formatSql };
