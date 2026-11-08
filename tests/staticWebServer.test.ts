import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const { createWebServer } = require('../script/serve_web.cjs');

describe('servidor local do frontend exportado', () => {
	let directory: string;
	let server: Server;
	let origin: string;
	beforeAll(async () => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumus-web-'));
		fs.writeFileSync(path.join(directory, 'index.html'), '<main>Lumus</main>');
		fs.writeFileSync(path.join(directory, 'app.js'), 'window.LUMUS = true;');
		server = createWebServer(directory);
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()));
		fs.rmSync(directory, { recursive: true });
	});
	it('serve assets e preserva o fallback das rotas do Expo Router', async () => {
		expect(await (await fetch(`${origin}/app.js`)).text()).toBe('window.LUMUS = true;');
		const route = await fetch(`${origin}/web/financial-list`);
		expect(route.status).toBe(200);
		expect(await route.text()).toBe('<main>Lumus</main>');
	});
	it('recusa caminhos fora da exportação e métodos de escrita', async () => {
		expect((await fetch(`${origin}/%2e%2e%2foutside`)).status).toBe(403);
		expect((await fetch(origin, { method: 'POST' })).status).toBe(405);
	});
});
