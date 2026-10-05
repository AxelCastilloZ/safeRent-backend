import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GeoapifyResult {
    formatted: string;
    lat: number;
    lon: number;
    result_type?: string;
}

@Injectable()
export class LocationService {
    constructor(private readonly config: ConfigService) {}

    async search(text: string) {
        const apiKey = this.config.get<string>('GEOAPIFY_API_KEY');
        if (!apiKey) throw new ServiceUnavailableException('La búsqueda de direcciones no está configurada. Puedes ubicar la propiedad en el mapa.');
        const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete');
        url.search = new URLSearchParams({ text, apiKey, format: 'json', lang: 'es', limit: '5' }).toString();
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!response.ok) throw new Error('Provider unavailable');
            const data = await response.json() as { results?: GeoapifyResult[] };
            if (!Array.isArray(data.results)) throw new Error('Invalid provider response');
            return data.results.filter((item) => typeof item.formatted === 'string' && Number.isFinite(item.lat) && Number.isFinite(item.lon) && Math.abs(item.lat) <= 90 && Math.abs(item.lon) <= 180)
                .map((item) => ({ address: item.formatted, latitude: item.lat, longitude: item.lon, type: item.result_type ?? 'unknown' }));
        } catch {
            throw new ServiceUnavailableException('No pudimos buscar la dirección. Intenta nuevamente o ubica la propiedad en el mapa.');
        }
    }
}
