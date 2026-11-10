// Synthetic Stage04 only: never reads the real authorized-account file or logs a hierarchy.
require('./firestore-recovery-run.cjs').protectedProcess(false);
const { deviceContext, matchesLabel, nodeBounds } = require('./native-ui.cjs');
const device = deviceContext({ uid: 'synthetic-stage04', email: 'banks-mobile@lumus.test' });
const command = process.argv[2] || 'probe',
	args = process.argv.slice(3);
const open = (route) => {
	device.close();
	device.run([
		'shell',
		'am',
		'start',
		'-a',
		'android.intent.action.VIEW',
		'-d',
		'exp://127.0.0.1:8088/--/' + route,
		'-p',
		'host.exp.exponent',
	]);
};
function safeProbe() {
	const p = device.probe();
	if (!p.nodes) return { foreground: false };
	const text = p.nodes.map((n) => n.text + ' ' + n['content-desc']).join(' ');
	return {
		foreground: true,
		login: !!p.flags.login,
		syntheticBanner: /Bancos e saldo inicial disponíveis em testes/.test(text),
		runtimeError: p.flags.runtimeError,
		controls: (/Bancos e saldo inicial disponíveis em testes/.test(text) || p.flags.login ? p.nodes : [])
			.filter((n) => nodeBounds(n) && (n.clickable === 'true' || n.class === 'android.widget.EditText'))
			.map((n) => ({
				label: n['content-desc'] || n.text,
				enabled: n.enabled,
				bounds: nodeBounds(n),
				editable: n.class === 'android.widget.EditText',
			})),
		has1500: /1.500,00/.test(text),
		hasSaved: /Conta .* salva com abertura/.test(text),
		hasAccount: /Conta Android/.test(text),
		hasArchived: /Arquivada/.test(text),
	};
}
(async () => {
	if (command === 'open') {
		open(args[0] || 'mobile');
		console.log('Synthetic local Expo link opened.');
		return;
	}
	if (command === 'tap') {
		const p = device.probe();
		const current=p.nodes.filter(n=>matchesLabel(n,args[0])).at(-1);
        if(!current)throw Error('Current native control missing');
        device.tap([current], args[0]);
		console.log('Native control tapped.');
		return;
	}
	if (command === 'fill') {
		const p = device.probe();
		const n = p.nodes.filter((n) => matchesLabel(n, args[0]) && n.class === 'android.widget.EditText').at(-1);
		if (!n) throw Error('Native editable label missing');
		device.tap([n], args[0]);
		device.shell('input keyevent KEYCODE_MOVE_END');
		device.shell('input keyevent ' + Array(100).fill('KEYCODE_DEL').join(' '));
		if (!/^[A-Za-z0-9@.,! -]+$/.test(args[1])) throw Error('Synthetic ASCII text required');
		device.shell("input text '" + args[1].replace(/ /g, '%s') + "'");
		console.log('Synthetic input entered.');
		return;
	}
	if (command === 'swipe') {
		device.shell('input swipe 720 2350 720 900 400');
		console.log('Native page scrolled.');
		return;
	}
	console.log(JSON.stringify(safeProbe()));
})().catch(() => {
	console.error('Synthetic device action failed; no hierarchy or identifiers logged.');
	process.exitCode = 1;
});
