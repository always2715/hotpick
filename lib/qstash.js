import { Client, Receiver } from '@upstash/qstash';

let client = null;
let receiver = null;

export function qstashConfigured() {
  return Boolean(
    String(process.env.QSTASH_TOKEN || '').trim() &&
    String(process.env.QSTASH_CURRENT_SIGNING_KEY || '').trim() &&
    String(process.env.QSTASH_NEXT_SIGNING_KEY || '').trim()
  );
}

export function getSiteUrl() {
  return String(
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://stellate.co.kr'
  ).replace(/\/$/, '');
}

export function getQStashClient() {
  const token = String(process.env.QSTASH_TOKEN || '').trim();
  if (!token) throw new Error('QSTASH_TOKEN이 설정되지 않았습니다.');
  if (!client) client = new Client({ token });
  return client;
}

function getReceiver() {
  const currentSigningKey = String(process.env.QSTASH_CURRENT_SIGNING_KEY || '').trim();
  const nextSigningKey = String(process.env.QSTASH_NEXT_SIGNING_KEY || '').trim();
  if (!currentSigningKey || !nextSigningKey) {
    throw new Error('QStash 서명 키가 설정되지 않았습니다.');
  }
  if (!receiver) receiver = new Receiver({ currentSigningKey, nextSigningKey });
  return receiver;
}

export async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function verifyQStashRequest(req) {
  const rawBody = await readRawBody(req);
  const signature = String(req.headers['upstash-signature'] || '');
  if (!signature) throw new Error('QStash 서명이 없습니다.');

  const path = String(req.url || '').split('?')[0];
  const url = `${getSiteUrl()}${path}`;
  await getReceiver().verify({ body: rawBody, signature, url });

  let body = {};
  if (rawBody) {
    try { body = JSON.parse(rawBody); }
    catch { throw new Error('잘못된 QStash JSON 본문입니다.'); }
  }
  return { body, rawBody };
}
