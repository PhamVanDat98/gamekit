// Store page material for each portal: images in the sizes the portal wants, and the listing text
// (store/listing.yaml) in every language the game ships.
import path from 'node:path';
import { exists, readYaml } from './io.mjs';
import { check } from './schema.mjs';
import { imageSize } from './png.mjs';
import { loadPortal } from './portals.mjs';

/**
 * Used when a portal kit has no `store:` block. GameKit's own common set — not a portal's rule;
 * put the real sizes and limits in portals/<id>/portal.yaml once the portal publishes them.
 */
export const DEFAULT_STORE = {
  images: [
    { name: 'icon', width: 512, height: 512, from: 'icon' },
    { name: 'thumb', width: 512, height: 384, from: 'landscape' },
    { name: 'cover', width: 1280, height: 720, from: 'landscape' },
    { name: 'portrait', width: 720, height: 1280, from: 'portrait' },
  ],
  listing: { title: { max: 40 }, short: { max: 120 }, description: { min: 100, max: 3000 }, controls: { min: 10, max: 500 }, tags: { min: 3, max: 10 } },
};

/** Portals that get a store page (dev-mock is a local test shell). */
export const storePortals = (game) => (game.portals ?? []).filter((p) => p !== 'dev-mock');

export function storeSpec(id) {
  const kit = loadPortal(id);
  return { spec: kit.config.store ?? DEFAULT_STORE, generic: !kit.config.store };
}

export function loadListing(root) {
  const f = path.join(root, 'store', 'listing.yaml');
  return exists(f) ? readYaml(f) : null;
}

const isTodo = (s) => typeof s === 'string' && /^TODO\b/.test(s.trim());

/** { errors, warnings } for the store material of every portal (or `only`). */
export function storeProblems(root, game, only) {
  const errors = [];
  const warnings = [];
  const portals = only ? [only] : storePortals(game);
  if (!portals.length) return { errors, warnings };
  let listing = null;
  try {
    listing = loadListing(root);
  } catch (e) {
    errors.push(`store/listing.yaml: ${e.message}`);
  }
  if (!listing && !errors.length) errors.push('thiếu store/listing.yaml — chạy gamekit store để tạo khung');
  if (listing) {
    for (const e of check('store-listing', listing)) errors.push(`store/listing.yaml: ${e}`);
    for (const field of ['title', 'short', 'description', 'controls']) {
      const v = listing[field];
      if (!v || typeof v !== 'object') continue;
      for (const [code, s] of Object.entries(v)) if (isTodo(s)) errors.push(`store/listing.yaml: ${field}.${code} còn TODO`);
      const miss = (game.languages ?? ['en']).filter((c) => !v[c]);
      if (miss.length) warnings.push(`store/listing.yaml: ${field} thiếu ${miss.join(', ')} (portal sẽ hiện bản en)`);
    }
  }
  for (const id of portals) {
    let s;
    try {
      s = storeSpec(id);
    } catch (e) {
      errors.push(e.message);
      continue;
    }
    if (s.generic) warnings.push(`portals/${id}: chưa khai báo yêu cầu store (store: trong portal.yaml) — đang dùng bộ kích thước chung của GameKit`);
    for (const img of s.spec.images ?? []) {
      const rel = `store/${id}/${img.name}.png`;
      const f = path.join(root, rel);
      if (!exists(f)) errors.push(`thiếu ${rel} (${img.width}×${img.height}) — gamekit store`);
      else {
        const size = imageSize(f);
        if (!size || size.width !== img.width || size.height !== img.height) errors.push(`${rel}: ${size ? `${size.width}×${size.height}` : 'không đọc được'}, cần ${img.width}×${img.height}`);
      }
    }
    if (!listing) continue;
    for (const [field, lim] of Object.entries(s.spec.listing ?? {})) {
      if (field === 'tags') {
        const n = listing.tags?.length ?? 0;
        if (lim.min && n < lim.min) errors.push(`${id}: cần ít nhất ${lim.min} tag (có ${n})`);
        if (lim.max && n > lim.max) errors.push(`${id}: nhiều nhất ${lim.max} tag (có ${n})`);
        continue;
      }
      for (const [code, text] of Object.entries(listing[field] ?? {})) {
        const n = [...String(text)].length;
        if (lim.max && n > lim.max) errors.push(`${id}: ${field}.${code} dài ${n} ký tự > ${lim.max}`);
        if (lim.min && n < lim.min && !isTodo(text)) errors.push(`${id}: ${field}.${code} ngắn ${n} ký tự < ${lim.min}`);
      }
    }
  }
  return { errors, warnings };
}

export const listingSkeleton = (game) => `# Trang game trên portal — mỗi ngôn ngữ một bản (en bắt buộc). gamekit store kiểm độ dài theo từng portal.
$schema: ../.gamekit/schemas/store-listing.schema.json
title:
  en: ${JSON.stringify(game.title)}
short:
  en: "TODO: một câu giới thiệu"
description:
  en: "TODO: mô tả 2–4 đoạn: chơi gì, vì sao vui, có gì đặc biệt"
controls:
  en: "TODO: máy tính — phím…; điện thoại — chạm…"
tags: []
`;

