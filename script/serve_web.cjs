const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const contentTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
};

function createWebServer(directory) {
	const root = path.resolve(directory);
	return http.createServer((request, response) => {
		if (!['GET', 'HEAD'].includes(request.method)) {
			response.writeHead(405).end();
			return;
		}
		let relative;
		try {
			relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
		} catch {
			response.writeHead(400).end();
			return;
		}
		const target = path.resolve(root, `.${relative}`);
		if (target !== root && !target.startsWith(root + path.sep)) {
			response.writeHead(403).end();
			return;
		}
		const file =
			fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(root, 'index.html');
		if (!fs.existsSync(file)) {
			response.writeHead(404).end('Execute npm run web:export antes de servir.');
			return;
		}
		response.writeHead(200, {
			'Content-Type': contentTypes[path.extname(file)] ?? 'application/octet-stream',
			'Cache-Control': 'no-store',
		});
		if (request.method === 'HEAD') response.end();
		else
			fs.createReadStream(file)
				.on('error', () => response.destroy())
				.pipe(response);
	});
}

if (require.main === module) {
	const server = createWebServer(path.join(__dirname, '..', 'dist'));
	const port = Number(process.env.LUMUS_WEB_PORT || 4173);
	server.listen(port, '127.0.0.1', () => console.log(`Lumus: http://127.0.0.1:${port}`));
	server.on('error', (error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
module.exports = { createWebServer };
