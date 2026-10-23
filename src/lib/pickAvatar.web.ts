/**
 * Elegir una foto de perfil en el NAVEGADOR: abre el selector de archivos, recorta el centro
 * en cuadrado y la achica a 160×160 con un <canvas>. Devuelve la foto lista para enviar,
 * o null si se canceló.
 */
export function pickAvatar(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Tu navegador no puede procesar la foto.'));
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 160, 160);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer esa imagen.'));
      };
      img.src = url;
    };
    input.click();
  });
}
