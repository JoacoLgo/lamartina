import { Platform, Share } from 'react-native';

import { formatToPar, holeTotal, isScored, leaderboard, playerTotals, scoreShape } from '@/domain/scoring';
import { courseParTotal, roundSummaryText } from '@/domain/stats';
import type { Hole, Round } from '@/domain/types';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawScoreCellMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  total: number,
  par: number,
) {
  const shape = scoreShape(total, par);
  const diff = total - par;
  const color = diff < 0 ? '#1F6B3B' : diff > 0 ? '#B54032' : '#1E2B22';
  const size = 36;
  const half = size / 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;

  if (shape.includes('circle')) {
    ctx.beginPath();
    ctx.arc(cx, cy, half, 0, Math.PI * 2);
    ctx.stroke();
    if (shape.startsWith('double')) {
      ctx.beginPath();
      ctx.arc(cx, cy, half - 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (shape.includes('square')) {
    drawRoundedRect(ctx, cx - half, cy - half, size, size, 5);
    ctx.stroke();
    if (shape.startsWith('double')) {
      drawRoundedRect(ctx, cx - half + 5.5, cy - half + 5.5, size - 11, size - 11, 3);
      ctx.stroke();
    }
  }

  ctx.fillStyle = color;
  ctx.font = '700 19px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(total), cx, cy + 1);
  ctx.restore();
}

function drawInstagramGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, x, y, size, size, size * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.23, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size * 0.76, y + size * 0.24, size * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTrophyCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;

  // Copa superior
  ctx.beginPath();
  ctx.moveTo(cx - 5.5, cy - 6.5);
  ctx.lineTo(cx + 5.5, cy - 6.5);
  ctx.lineTo(cx + 4.2, cy - 1);
  ctx.arc(cx, cy - 1, 4.2, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();

  // Asas laterales
  ctx.beginPath();
  ctx.arc(cx - 5.2, cy - 3.8, 2.2, Math.PI * 0.5, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 5.2, cy - 3.8, 2.2, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();

  // Tallo y base
  ctx.fillRect(cx - 1.2, cy + 2.8, 2.4, 3);
  ctx.fillRect(cx - 4.2, cy + 5.5, 8.4, 2);
  ctx.restore();
}

const TROPHY_CUP_COLORS: Record<number, string> = {
  1: '#D4AF37', // Copa de oro
  2: '#8E9AA8', // Copa de plata
  3: '#B87333', // Copa de bronce
};

/**
 * Genera una imagen PNG (1080px) con diseño "aesthetic" / editorial de club:
 * - "La Martina" centrado arriba y debajo chiquito "FOOTGOLF" entre líneas suaves.
 * - Marco doble delicado en tonos crema, verde bosque y dorado suave.
 * - Tarjeta limpia con posiciones (1, 2, 3 con sus copas de oro/plata/bronce) en cada fila y @lamartina al pie.
 */
export async function generateScorecardPng(
  round: Round,
  instagramHandle = '@lamartina',
): Promise<{ blob: Blob; dataUrl: string } | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;

  const frontHoles = round.holes.filter((h) => h.number <= 9);
  const backHoles = round.holes.filter((h) => h.number > 9);
  const hasBack = backHoles.length > 0;
  const rankedPlayers = leaderboard(round).map((r, idx) => ({
    ...r,
    rankOrder: idx + 1,
  }));

  const SCALE = 2; // 2x Ultra-HD (2160px de ancho real) para máxima nitidez al compartir
  const W = 1080;
  const PAD = 58;
  const INNER_W = W - PAD * 2;

  const brandHeaderH = 162;
  const tableBlockH = (holesBlock: Hole[]) =>
    holesBlock.length === 0 ? 0 : 44 + 36 + rankedPlayers.length * 56 + 24;
  const frontTableH = tableBlockH(frontHoles);
  const backTableH = hasBack ? tableBlockH(backHoles) : 0;
  const footerH = 74;

  const H = PAD + brandHeaderH + frontTableH + backTableH + footerH + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fondo crema marfil editorial
  ctx.fillStyle = '#FAF6EC';
  ctx.fillRect(0, 0, W, H);

  // Marco doble suave de club
  drawRoundedRect(ctx, 24, 24, W - 48, H - 48, 30);
  ctx.strokeStyle = 'rgba(182, 152, 92, 0.72)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  drawRoundedRect(ctx, 35, 35, W - 70, H - 70, 22);
  ctx.strokeStyle = 'rgba(20, 51, 33, 0.22)';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  let y = PAD + 6;

  // 1. MARCA CENTRADA ESTILO AESTHETIC: "La Martina" y abajo chiquito "FOOTGOLF" con líneas suaves
  ctx.fillStyle = '#12311F';
  ctx.font = '700 64px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('La Martina', W / 2, y);

  const subY = y + 78;
  ctx.strokeStyle = 'rgba(182, 152, 92, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 220, subY + 8);
  ctx.lineTo(W / 2 - 90, subY + 8);
  ctx.moveTo(W / 2 + 90, subY + 8);
  ctx.lineTo(W / 2 + 220, subY + 8);
  ctx.stroke();

  ctx.fillStyle = '#8C6F36';
  ctx.font = '800 17px sans-serif';
  ctx.fillText('F O O T G O L F', W / 2, subY);

  const dateStr = new Date(round.startedAt).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  ctx.fillStyle = '#5F695E';
  ctx.font = '600 17px sans-serif';
  ctx.fillText(`${dateStr}  ·  ${round.holes.length} hoyos`, W / 2, y + 112);

  y += brandHeaderH;

  // 2. TARJETA LIMPIA DE ALTA DEFINICIÓN CON POSICIÓN Y COPA (ORO, PLATA, BRONCE) EN CADA NOMBRE
  const drawScoreTable = (holesBlock: Hole[], subLabel: string, isBackBlock: boolean) => {
    const nameColW = 220;
    const subColW = 84;
    const totColW = 108;
    const holeColW = (INNER_W - nameColW - subColW - totColW) / holesBlock.length;

    const tableH = 44 + 36 + rankedPlayers.length * 56;
    drawRoundedRect(ctx, PAD, y, INNER_W, tableH, 18);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Encabezado verde bosque profundo
    drawRoundedRect(ctx, PAD, y, INNER_W, 44, 16);
    ctx.fillStyle = '#12311F';
    ctx.fill();

    ctx.fillStyle = '#FAF6EC';
    ctx.font = '800 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('JUGADOR / HOYO', PAD + 16, y + 22);

    holesBlock.forEach((h, i) => {
      const hx = PAD + nameColW + i * holeColW + holeColW / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FAF6EC';
      ctx.fillText(String(h.number), hx, y + 22);
    });

    const subX = PAD + nameColW + holesBlock.length * holeColW + subColW / 2;
    const totX = PAD + nameColW + holesBlock.length * holeColW + subColW + totColW / 2;
    ctx.fillStyle = '#E6CE97';
    ctx.fillText(subLabel, subX, y + 22);
    ctx.fillStyle = '#FAF6EC';
    ctx.fillText('TOT', totX, y + 22);

    let rowY = y + 44;

    // Fila de Par
    ctx.fillStyle = '#F5EFE0';
    ctx.fillRect(PAD + 2, rowY, INNER_W - 4, 36);
    ctx.fillStyle = '#6A7368';
    ctx.font = '700 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Par', PAD + 16, rowY + 18);

    holesBlock.forEach((h, i) => {
      const hx = PAD + nameColW + i * holeColW + holeColW / 2;
      ctx.textAlign = 'center';
      ctx.fillText(String(h.par), hx, rowY + 18);
    });

    const blockPar = courseParTotal(holesBlock);
    const totalPar = courseParTotal(round.holes);
    ctx.fillStyle = '#12311F';
    ctx.font = '800 15px sans-serif';
    ctx.fillText(String(blockPar), subX, rowY + 18);
    ctx.fillText(String(totalPar), totX, rowY + 18);

    rowY += 36;

    // Filas de jugadores ordenadas por puesto (1, 2, 3 con su copa y siguientes)
    rankedPlayers.forEach(({ player: p, rankOrder }, pIdx) => {
      if (pIdx % 2 === 1) {
        ctx.fillStyle = '#FCFBF7';
        ctx.fillRect(PAD + 2, rowY, INNER_W - 4, 56);
      }

      if (pIdx > 0) {
        ctx.strokeStyle = 'rgba(205, 194, 170, 0.65)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(PAD + 10, rowY);
        ctx.lineTo(PAD + INNER_W - 10, rowY);
        ctx.stroke();
      }

      const midY = rowY + 28;
      const cupColor = TROPHY_CUP_COLORS[rankOrder];

      // Número de posición (1, 2, 3, 4...)
      ctx.fillStyle = cupColor ? (rankOrder === 1 ? '#9C7416' : cupColor) : '#5F695E';
      ctx.font = '900 17px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(rankOrder), PAD + 14, midY + 1);

      let nameStartX = PAD + 36;
      if (cupColor) {
        drawTrophyCup(ctx, PAD + 38, midY, cupColor);
        nameStartX = PAD + 52;
      }

      ctx.fillStyle = '#17261C';
      ctx.font = '700 19px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText(p.name.slice(0, 13), nameStartX, midY + 1);

      holesBlock.forEach((h, i) => {
        const hx = PAD + nameColW + i * holeColW + holeColW / 2;
        const s = round.scores[p.id]?.[h.number];
        if (isScored(s)) {
          drawScoreCellMark(ctx, hx, midY, holeTotal(s), h.par);
        } else {
          ctx.fillStyle = '#A0A69E';
          ctx.font = '600 16px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('–', hx, midY);
        }
      });

      const totals = playerTotals(round, p.id);
      const subVal = isBackBlock ? totals.backStrokes : totals.frontStrokes;

      ctx.fillStyle = '#F6F0E0';
      ctx.fillRect(PAD + nameColW + holesBlock.length * holeColW, rowY + 1, subColW, 54);

      ctx.fillStyle = '#12311F';
      ctx.font = '800 19px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(subVal ? String(subVal) : '–', subX, midY);

      ctx.fillStyle = '#12311F';
      ctx.font = '900 19px sans-serif';
      const totLabel = totals.strokes ? `${totals.strokes} (${formatToPar(totals.toPar)})` : '–';
      ctx.fillText(totLabel, totX, midY);

      rowY += 56;
    });

    drawRoundedRect(ctx, PAD, y, INNER_W, tableH, 18);
    ctx.strokeStyle = 'rgba(182, 152, 92, 0.65)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    y += tableH + 24;
  };

  drawScoreTable(frontHoles, 'IDA', false);
  if (hasBack) {
    drawScoreTable(backHoles, 'VTA', true);
  }

  // 4. PIE AESTHETIC CON INSTAGRAM (@lamartina) Y LÍNEAS SUAVES
  const footMidY = y + 26;
  ctx.strokeStyle = 'rgba(182, 152, 92, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(PAD + 80, footMidY);
  ctx.lineTo(W / 2 - 120, footMidY);
  ctx.moveTo(W / 2 + 120, footMidY);
  ctx.lineTo(W - PAD - 80, footMidY);
  ctx.stroke();

  const cleanHandle = instagramHandle.startsWith('@') ? instagramHandle : `@${instagramHandle}`;
  drawInstagramGlyph(ctx, W / 2 - 78, footMidY - 11, 22, '#143321');
  ctx.fillStyle = '#143321';
  ctx.font = '700 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(cleanHandle, W / 2 - 48, footMidY + 1);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) return null;
  return { blob, dataUrl };
}

export type ShareChannel = 'native' | 'instagram' | 'whatsapp' | 'facebook' | 'download';

export async function shareScorecardToChannel(
  round: Round,
  channel: ShareChannel,
  cached?: { blob: Blob; dataUrl: string } | null,
  instagramHandle = '@lamartina',
): Promise<{ ok: boolean; statusText: string }> {
  const summary = roundSummaryText(round);
  const fileName = `la-martina-tarjeta-${round.id.slice(0, 6)}.png`;

  if (Platform.OS !== 'web') {
    try {
      await Share.share({
        title: 'La Martina Footgolf',
        message: summary,
      });
      return { ok: true, statusText: 'Menú de compartir abierto.' };
    } catch {
      return { ok: false, statusText: 'No se pudo abrir el menú de compartir.' };
    }
  }

  const generated = cached ?? (await generateScorecardPng(round, instagramHandle));

  const triggerDownload = (dataUrl: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (channel === 'download') {
    if (!generated) return { ok: false, statusText: 'No se pudo generar la imagen.' };
    triggerDownload(generated.dataUrl);
    return { ok: true, statusText: '¡Tarjeta descargada en alta calidad (PNG)!' };
  }

  if (generated && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([generated.blob], fileName, { type: 'image/png' });
      const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({
          title: 'La Martina Footgolf',
          text: '¡Nuestra partida en La Martina Footgolf!',
          files: [file],
        });
        return { ok: true, statusText: '¡Tarjeta compartida!' };
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, statusText: '' };
      }
    }
  }

  if (generated) {
    triggerDownload(generated.dataUrl);
  }

  if (channel === 'whatsapp') {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(summary)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    return {
      ok: true,
      statusText: 'Se descargó la tarjeta y se abrió WhatsApp para adjuntarla.',
    };
  }

  if (channel === 'instagram') {
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    return {
      ok: true,
      statusText: '¡Tarjeta descargada! Subila directo a tu Instagram.',
    };
  }

  if (channel === 'facebook') {
    window.open('https://www.facebook.com/', '_blank', 'noopener,noreferrer');
    return {
      ok: true,
      statusText: '¡Tarjeta descargada! Subila directo a Facebook.',
    };
  }

  return {
    ok: true,
    statusText: '¡Imagen de la tarjeta descargada para compartir!',
  };
}
