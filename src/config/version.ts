import fs from 'fs';
import path from 'path';

let cachedVersion = '1.1.0';

try {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.version) {
      cachedVersion = pkg.version;
    }
  }
} catch {
  // Fallback para valor padrão se falhar a leitura
}

export const APP_VERSION = cachedVersion;
