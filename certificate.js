// Certificate rendering + PDF generation.
//
// Approach: every certificate is drawn onto a high-resolution
// offscreen canvas (template image + dynamic text overlays).
// jsPDF then embeds that canvas into a PDF page sized to match
// the template's natural aspect ratio.

window.PFD_CERT = (function () {

  // The template PNG is 1536 × 1024 (3:2).  We render at 2× to
  // stay crisp when scaled up for printing.
  const TPL_W = 1536, TPL_H = 1024;
  const SCALE = 2;
  const CANVAS_W = TPL_W * SCALE;
  const CANVAS_H = TPL_H * SCALE;

  // PDF page size: matches the original PDF (10.24 × 6.83 in).
  const PDF_W_IN = 10.24;
  const PDF_H_IN = 6.83;

  // --- text positions (as fractions of canvas size) ---------
  // Determined by overlaying a 10% grid on the template.
  const POS = {
    studentName:    { x: 0.5,  y: 0.41,  size: 0.078, color: '#7d1f2c', font: 'italic 600 {SIZE}px "Playfair Display","Garamond","Georgia",serif' },
    courseLine:     { x: 0.5,  y: 0.575, size: 0.034, color: '#1a1a1a', font: 'italic 500 {SIZE}px "Playfair Display","Garamond","Georgia",serif' },
    completionDate: { x: 0.5,  y: 0.745, size: 0.034, color: '#1a1a1a', font: 'italic 500 {SIZE}px "Playfair Display","Garamond","Georgia",serif' },
    primaryName:    { x: 0.21, y: 0.913, size: 0.020, color: '#0f1430', font: '700 {SIZE}px "Helvetica","Arial",sans-serif' },
    coName:         { x: 0.79, y: 0.913, size: 0.020, color: '#0f1430', font: '700 {SIZE}px "Helvetica","Arial",sans-serif' },
    primarySig:     { x: 0.21, y: 0.86, w: 0.26, h: 0.10 },
    coSig:          { x: 0.79, y: 0.86, w: 0.26, h: 0.10 },
    courseLogo:     { x: 0.50, y: 0.88, w: 0.09, h: 0.09 }
  };

  // Cache the template so we don't reload it for every page.
  let _tpl = null;
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  async function getTemplate() {
    if (!_tpl) _tpl = await loadImage('assets/certificate-template.png');
    return _tpl;
  }

  // --- date formatting --------------------------------------
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[m-1] + ' ' + d + ', ' + y;
  }
  function dateString(state) {
    if (state.dateMode === 'range' && state.dateEnd) {
      return fmtDate(state.dateStart) + ' – ' + fmtDate(state.dateEnd);
    }
    return fmtDate(state.dateStart);
  }
  function courseLineText(state) {
    const num = (state.courseNumber || '').trim();
    const nm  = (state.courseName   || '').trim();
    if (num && nm) return num + ' ' + nm;
    return num || nm;
  }

  // --- canvas drawing ---------------------------------------
  function fitFont(ctx, text, baseSize, maxWidth, fontTpl) {
    let size = baseSize;
    ctx.font = fontTpl.replace('{SIZE}', size);
    while (ctx.measureText(text).width > maxWidth && size > baseSize * 0.5) {
      size -= 2;
      ctx.font = fontTpl.replace('{SIZE}', size);
    }
    return size;
  }

  function drawCenteredText(ctx, text, posKey, opts = {}) {
    if (!text) return;
    const p = POS[posKey];
    const baseSize = p.size * CANVAS_H;
    const maxWidth = (opts.maxWidth || 0.78) * CANVAS_W;
    const fontTpl  = p.font;
    fitFont(ctx, text, baseSize, maxWidth, fontTpl);
    ctx.fillStyle = p.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, p.x * CANVAS_W, p.y * CANVAS_H);
  }

  function drawImageCentered(ctx, img, posKey) {
    const p = POS[posKey];
    const w = p.w * CANVAS_W;
    const h = p.h * CANVAS_H;
    // Preserve aspect ratio inside the box.
    const ar = img.width / img.height;
    let dw = w, dh = h;
    if (ar > w / h) { dh = w / ar; } else { dw = h * ar; }
    const dx = p.x * CANVAS_W - dw / 2;
    const dy = p.y * CANVAS_H - dh / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // Renders one certificate to a fresh canvas and returns it.
  async function renderToCanvas(state, student) {
    const tpl = await getTemplate();
    const cvs = document.createElement('canvas');
    cvs.width = CANVAS_W;
    cvs.height = CANVAS_H;
    const ctx = cvs.getContext('2d');

    // 1. background template
    ctx.drawImage(tpl, 0, 0, CANVAS_W, CANVAS_H);

    // 2. student name
    const fullName = (student.first + ' ' + student.last).trim();
    drawCenteredText(ctx, fullName, 'studentName', { maxWidth: 0.78 });

    // 3. course line
    drawCenteredText(ctx, courseLineText(state), 'courseLine', { maxWidth: 0.86 });

    // 4. date
    drawCenteredText(ctx, dateString(state), 'completionDate', { maxWidth: 0.6 });

    // 5. instructor signatures + names
    if (state.primarySigImg) {
      const im = await loadImage(state.primarySigImg);
      drawImageCentered(ctx, im, 'primarySig');
    }
    if (state.primaryName) drawCenteredText(ctx, state.primaryName, 'primaryName', { maxWidth: 0.34 });

    if (!state.coNA) {
      if (state.coSigImg) {
        const im = await loadImage(state.coSigImg);
        drawImageCentered(ctx, im, 'coSig');
      }
      if (state.coName) drawCenteredText(ctx, state.coName, 'coName', { maxWidth: 0.34 });
    }

    // 6. optional course logo (centered between signatures)
    if (state.courseLogoSrc) {
      try {
        const im = await loadImage(state.courseLogoSrc);
        drawImageCentered(ctx, im, 'courseLogo');
      } catch { /* ignore */ }
    }

    return cvs;
  }

  // --- PDF building -----------------------------------------
  function makePDF() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({
      orientation: 'landscape',
      unit: 'in',
      format: [PDF_W_IN, PDF_H_IN],
      compress: true
    });
  }

  function canvasToPDF(pdf, canvas, addPage) {
    if (addPage) pdf.addPage([PDF_W_IN, PDF_H_IN], 'landscape');
    const data = canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(data, 'JPEG', 0, 0, PDF_W_IN, PDF_H_IN, undefined, 'FAST');
  }

  function fileSafe(s) {
    return (s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
  }
  function studentFileName(student) {
    const first = (student.first || '').trim();
    const last  = (student.last  || '').trim();
    const fi = first ? first.charAt(0).toUpperCase() : '';
    return fileSafe(fi + last) || 'certificate';
  }

  // Generate certificates for every student, returning an array
  // of { name, blob } objects.  outputMode: 'combined' or 'separate'.
  // onProgress is called with (done, total).
  async function generate(state, students, outputMode, onProgress) {
    const out = [];
    if (outputMode === 'combined') {
      const pdf = makePDF();
      for (let i = 0; i < students.length; i++) {
        const cvs = await renderToCanvas(state, students[i]);
        canvasToPDF(pdf, cvs, i > 0);
        if (onProgress) onProgress(i + 1, students.length);
      }
      const safeCourse = fileSafe(state.courseNumber || state.courseName || 'Certificate');
      const date = (state.dateStart || '').replace(/-/g, '');
      out.push({ name: safeCourse + '_' + date + '_All.pdf', blob: pdf.output('blob') });
    } else {
      for (let i = 0; i < students.length; i++) {
        const cvs = await renderToCanvas(state, students[i]);
        const pdf = makePDF();
        canvasToPDF(pdf, cvs, false);
        out.push({ name: studentFileName(students[i]) + '.pdf', blob: pdf.output('blob') });
        if (onProgress) onProgress(i + 1, students.length);
      }
    }
    return out;
  }

  // For a quick on-screen preview.
  async function previewCanvas(state, student, intoCanvas) {
    const cvs = await renderToCanvas(state, student);
    const ctx = intoCanvas.getContext('2d');
    intoCanvas.width = cvs.width;
    intoCanvas.height = cvs.height;
    ctx.drawImage(cvs, 0, 0);
  }

  return { generate, previewCanvas, studentFileName };

})();
