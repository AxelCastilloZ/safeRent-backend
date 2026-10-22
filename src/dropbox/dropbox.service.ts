import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

interface Metadata {
  path_lower: string;
  name: string;
  rev: string;
}

@Injectable()
export class DropboxService {
  private token?: { value: string; expires: number };
  private refreshing?: Promise<string>;
  constructor(private readonly config: ConfigService) {}

  private accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now())
      return Promise.resolve(this.token.value);
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    const clientId = this.config.get<string>('DROPBOX_APP_KEY');
    const clientSecret = this.config.get<string>('DROPBOX_APP_SECRET');
    const refreshToken = this.config.get<string>('DROPBOX_REFRESH_TOKEN');
    if (!clientId || !clientSecret || !refreshToken) {
      throw new ServiceUnavailableException(
        'El almacenamiento Dropbox aún no está configurado.',
      );
    }
    try {
      const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      if (!response.ok) throw new Error('token');
      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };
      this.token = {
        value: data.access_token,
        expires: Date.now() + (data.expires_in - 60) * 1000,
      };
      return data.access_token;
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo conectar con Dropbox. Intenta nuevamente.',
      );
    }
  }

  private async request(
    endpoint: string,
    args: object,
    contents?: Buffer,
  ): Promise<Response> {
    // Preserve configuration/authentication errors from the token provider.
    // Only errors from the HTTP request itself are connectivity failures.
    const token = await this.accessToken();
    try {
      const response = await fetch(
        `https://${contents ? 'content' : 'api'}.dropboxapi.com/2/${endpoint}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(60000),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': contents
              ? 'application/octet-stream'
              : 'application/json',
            ...(contents ? { 'Dropbox-API-Arg': JSON.stringify(args) } : {}),
          },
          body: contents ? new Uint8Array(contents) : JSON.stringify(args),
        },
      );
      if (response.status === 401) this.token = undefined;
      return response;
    } catch {
      throw new ServiceUnavailableException(
        'Dropbox no está disponible. Intenta nuevamente.',
      );
    }
  }

  private async rpc<T>(endpoint: string, args: object): Promise<T> {
    const response = await this.request(endpoint, args);
    if (!response.ok)
      throw new ServiceUnavailableException(
        'No se pudo completar la operación en Dropbox.',
      );
    return response.json() as Promise<T>;
  }

  private root() {
    const root =
      '/' +
      (this.config.get<string>('DROPBOX_ROOT_FOLDER') || 'SafeRent').replace(
        /^\/+|\/+$/g,
        '',
      );
    if (root.split('/').some((part) => part === '..' || part === '.'))
      throw new ServiceUnavailableException('Carpeta Dropbox inválida.');
    return root;
  }

  private async ensureFolder(path: string) {
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      const response = await this.request('files/create_folder_v2', {
        path: '/' + parts.slice(0, i).join('/'),
        autorename: false,
      });
      if (response.ok) continue;
      const error = (await response.json()) as { error_summary?: string };
      if (
        response.status !== 409 ||
        !error.error_summary?.startsWith('path/conflict/folder')
      ) {
        throw new ServiceUnavailableException(
          'No se pudo crear la carpeta en Dropbox.',
        );
      }
    }
  }

  async upload(file: Express.Multer.File, folder: string) {
    const base = `${this.root()}/${folder}`;
    await this.ensureFolder(base);
    const extension = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    }[file.mimetype];
    const response = await this.request(
      'files/upload',
      {
        path: `${base}/${randomUUID()}.${extension || 'bin'}`,
        mode: 'add',
        autorename: false,
        mute: true,
      },
      file.buffer,
    );
    if (!response.ok)
      throw new ServiceUnavailableException(
        'No se pudo subir el archivo a Dropbox.',
      );
    const metadata = (await response.json()) as Metadata;
    try {
      const url = await this.sharedLink(metadata.path_lower);
      return { path: metadata.path_lower, rev: metadata.rev, url };
    } catch (error) {
      await this.delete(metadata.path_lower).catch(() => undefined);
      throw error;
    }
  }

  async metadata(path: string) {
    return this.rpc<Metadata>('files/get_metadata', { path });
  }

  async existingSharedLink(path: string) {
    const existing = await this.rpc<{ links: { url: string }[] }>(
      'sharing/list_shared_links',
      { path, direct_only: true },
    );
    if (!existing.links[0]?.url)
      throw new ServiceUnavailableException(
        'El archivo no tiene un enlace compartido existente.',
      );
    const direct = new URL(existing.links[0].url);
    direct.searchParams.delete('dl');
    direct.searchParams.set('raw', '1');
    return direct.toString();
  }

  async sharedLink(path: string) {
    const response = await this.request(
      'sharing/create_shared_link_with_settings',
      { path },
    );
    const data = (await response.json()) as {
      url?: string;
      error?: {
        '.tag'?: string;
        shared_link_already_exists?: { metadata?: { url?: string } };
      };
    };
    let url = response.ok
      ? data.url
      : data.error?.shared_link_already_exists?.metadata?.url;
    if (
      !url &&
      response.status === 409 &&
      data.error?.['.tag'] === 'shared_link_already_exists'
    ) {
      const existing = await this.rpc<{ links: { url: string }[] }>(
        'sharing/list_shared_links',
        { path, direct_only: true },
      );
      url = existing.links[0]?.url;
    }
    if (!url)
      throw new ServiceUnavailableException(
        'No se pudo obtener el enlace del archivo en Dropbox.',
      );
    const direct = new URL(url);
    direct.searchParams.delete('dl');
    direct.searchParams.set('raw', '1');
    return direct.toString();
  }

  async delete(path: string) {
    const response = await this.request('files/delete_v2', { path });
    if (response.ok) return;
    const error = (await response.json()) as { error_summary?: string };
    if (
      response.status === 409 &&
      error.error_summary?.startsWith('path_lookup/not_found')
    )
      return;
    throw new ServiceUnavailableException(
      'No se pudo eliminar el archivo en Dropbox.',
    );
  }
}
