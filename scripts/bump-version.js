// scripts/bump-version.js — npm run push 전에 자동 실행
const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '../constants/version.ts');
const content = fs.readFileSync(versionFile, 'utf8');

const match = content.match(/APP_VERSION = '(\d{4}-\d{2}-\d{2})-(\d{3})'/);
if (!match) {
  console.error('버전 형식을 찾을 수 없습니다. constants/version.ts 확인 필요.');
  process.exit(1);
}

const [, currentDate, currentSeq] = match;

const now = new Date();
const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');

const newSeq = currentDate === today
  ? String(parseInt(currentSeq, 10) + 1).padStart(3, '0')
  : '001';

const newVersion = `${today}-${newSeq}`;
const newContent = content.replace(
  /APP_VERSION = '[\d-]+'/,
  `APP_VERSION = '${newVersion}'`,
);

fs.writeFileSync(versionFile, newContent, 'utf8');
console.log(`버전 업데이트: ${newVersion}`);
