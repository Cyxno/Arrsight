import fs from 'node:fs';

const target = process.argv[2];
try {
  fs.readdirSync(target, { withFileTypes: true }).slice(0, 1);
  process.stdout.write('ok');
} catch (error) {
  process.stderr.write(error?.message || 'read failed');
  process.exitCode = 2;
}
