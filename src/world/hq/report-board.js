import * as THREE from 'three';
import { BOARD_COUNT, boardLine } from '../../live/reports.js';
import { FONT, fitText, standLegs, wallBoard } from './room-parts.js';

// The board in each role room where finished subagents pin their final reports (latest few, newest first).
// Wall-mounted, or free-standing on legs where the room has no wall of its own.
export const REPORT_BOARD = { width: 1.6, height: 1.5, standY: 1.5, wallY: 1.9 };

const COLORS = { board: '#fbfaf7', muted: '#7a7d86', ink: '#2b2a33', failed: '#c62f32', failedBg: '#fdecec', row: '#efece5' };

// Returns { group, surface, draw(reports) }; `reports` is newest first.
export function buildReportBoard(room, mounted) {
  const group = new THREE.Group();
  group.name = `report-board-${room.id}`;
  group.userData.interact = { kind: 'report-board', label: `Read the ${room.name} reports`, data: { team: room } };

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = Math.round(640 * (REPORT_BOARD.height / REPORT_BOARD.width));
  drawReportBoard(canvas, room, []);
  const board = wallBoard(REPORT_BOARD.width, REPORT_BOARD.height, canvas);
  const draw = (reports) => {
    drawReportBoard(canvas, room, reports);
    board.texture.needsUpdate = true;
  };

  if (mounted) {
    group.add(board.group);
  } else {
    group.userData.solid = true;
    board.group.position.y = REPORT_BOARD.standY;
    group.add(board.group, standLegs(REPORT_BOARD.width, REPORT_BOARD.standY - REPORT_BOARD.height / 2));
  }
  return { group, surface: board.surface, draw };
}

function drawReportBoard(canvas, room, reports, now = Date.now()) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const accent = `#${new THREE.Color(room.color).getHexString()}`;
  const ink = new THREE.Color(room.color).getHSL({}).l > 0.55 ? '#2b2a33' : '#ffffff';
  const pad = 24;
  const headerH = 64;

  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, headerH);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.font = FONT(800, 32);
  ctx.fillText('📌  Reports', pad, headerH / 2 + 2);

  if (!reports.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.muted;
    ctx.font = FONT(700, 34);
    ctx.fillText('No reports yet', w / 2, h / 2 - 10);
    ctx.font = FONT(500, 22);
    ctx.fillText('Finished subagents pin theirs here', w / 2, h / 2 + 32);
    return;
  }

  const rowH = (h - headerH) / BOARD_COUNT;
  reports.slice(0, BOARD_COUNT).forEach((report, i) => {
    const { head, time, task, failed } = boardLine(report, now);
    const y = headerH + i * rowH;
    if (failed) {
      ctx.fillStyle = COLORS.failedBg;
      ctx.fillRect(0, y, w, rowH);
      ctx.fillStyle = COLORS.failed;
      ctx.fillRect(0, y, 10, rowH);
    } else if (i % 2) {
      ctx.fillStyle = COLORS.row;
      ctx.fillRect(0, y, w, rowH);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.muted;
    ctx.font = FONT(600, 22);
    ctx.fillText(time, w - pad, y + rowH * 0.32);
    const timeW = ctx.measureText(time).width;

    ctx.textAlign = 'left';
    ctx.fillStyle = failed ? COLORS.failed : COLORS.ink;
    ctx.font = FONT(800, 27);
    ctx.fillText(fitText(ctx, `${failed ? '⚠️ FAILED · ' : '✅ '}${head}`, w - pad * 2 - timeW - 14), pad, y + rowH * 0.32);

    ctx.fillStyle = COLORS.muted;
    ctx.font = FONT(500, 23);
    ctx.fillText(fitText(ctx, task, w - pad * 2), pad, y + rowH * 0.7);
  });
}
