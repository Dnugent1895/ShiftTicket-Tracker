// Signature pad wrapper.  Wraps the third-party `signature_pad`
// library to handle high-DPI canvases and easy reset.

window.PFD_SIG = (function () {

  function attach(canvas) {
    // Resize the backing store for hi-DPI screens.
    function resize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
    }
    resize();
    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgba(0,0,0,0)',
      penColor: '#1b2a4e',
      minWidth: 0.7,
      maxWidth: 2.4
    });
    // Re-resize on viewport changes.  signature_pad clears the
    // canvas on resize, so warn the user only if they had drawn
    // something already.
    let lastSig = null;
    window.addEventListener('resize', () => {
      lastSig = pad.toData();
      resize();
      if (lastSig) pad.fromData(lastSig);
    });
    return pad;
  }

  // Returns null if the pad is empty, otherwise a PNG dataURL of
  // just the signature with a transparent background.
  function toPNG(pad) {
    if (!pad || pad.isEmpty()) return null;
    return pad.toDataURL('image/png');
  }

  return { attach, toPNG };

})();
