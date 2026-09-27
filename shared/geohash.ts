const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precisao = 7): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new RangeError('Coordenada inválida');
  }
  const faixaLat = [-90, 90];
  const faixaLng = [-180, 180];
  let hash = '';
  let bits = 0;
  let valor = 0;
  let longitude = true;
  while (hash.length < precisao) {
    const faixa = longitude ? faixaLng : faixaLat;
    const coord = longitude ? lng : lat;
    const meio = (faixa[0] + faixa[1]) / 2;
    valor <<= 1;
    if (coord >= meio) {
      valor |= 1;
      faixa[0] = meio;
    } else {
      faixa[1] = meio;
    }
    longitude = !longitude;
    if (++bits === 5) {
      hash += BASE32[valor];
      bits = 0;
      valor = 0;
    }
  }
  return hash;
}
