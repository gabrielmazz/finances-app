const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOTS = ['app', 'components', 'contexts', 'design-system', 'hooks', 'screens', 'utils'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.css']);
const ALLOWED_COMPONENT_CSS = new Set([
	'components/web/navigation/StaggeredMenu.css',
	'components/web/visuals/Carousel.css',
	'components/web/visuals/Grainient.css',
	'components/web/visuals/StrokeText.css',
]);
const ALLOWED_STYLESHEETS = new Set([]);
const TOKEN_SOURCE_FILES = new Set([
	'design-system/tokens.ts',
	'components/ui/gluestack-ui-provider/config.ts',
]);
const METRIC_BASELINE = {
	inlineStyleProps: 1263,
	rawHexLiterals: 1275,
	arbitraryTailwindValues: 381,
	useScreenStylesFiles: 54,
};
const FILE_DEBT_BASELINE = JSON.parse(
	fs.readFileSync(path.join(ROOT, 'design-system/style-debt-baseline.json'), 'utf8'),
);

const normalize = value => value.split(path.sep).join('/');

const walk = directory => {
	if (!fs.existsSync(directory)) return [];
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) return walk(absolutePath);
		return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [absolutePath] : [];
	});
};

const files = SOURCE_ROOTS.flatMap(directory => walk(path.join(ROOT, directory)));
const errors = [];
const metrics = {
	inlineStyleProps: 0,
	rawHexLiterals: 0,
	arbitraryTailwindValues: 0,
	useScreenStylesFiles: 0,
};
const fileMetrics = {};

const count = (source, expression) => source.match(expression)?.length ?? 0;

for (const absolutePath of files) {
	const relativePath = normalize(path.relative(ROOT, absolutePath));
	const source = fs.readFileSync(absolutePath, 'utf8');
	const currentFileMetrics = {
		inlineStyleProps: count(source, /\bstyle\s*=/g),
		rawHexLiterals: count(source, /#[0-9a-f]{3,8}\b/gi),
		arbitraryTailwindValues: count(
			source,
			/(?:^|\s)(?:[\w-]+:)*(?:-?[\w-]+)-\[[^\]\r\n]+\]/g,
		),
		useScreenStyles: /\buseScreenStyles\b/.test(source) ? 1 : 0,
	};
	fileMetrics[relativePath] = currentFileMetrics;

	metrics.inlineStyleProps += currentFileMetrics.inlineStyleProps;
	if (!TOKEN_SOURCE_FILES.has(relativePath)) {
		metrics.rawHexLiterals += currentFileMetrics.rawHexLiterals;
	}
	metrics.arbitraryTailwindValues += currentFileMetrics.arbitraryTailwindValues;
	if (currentFileMetrics.useScreenStyles) metrics.useScreenStylesFiles += 1;

	if (/!important/.test(source)) {
		errors.push(`${relativePath}: !important não é permitido`);
	}
	if (/\btransition-all\b/.test(source)) {
		errors.push(`${relativePath}: use transições de propriedades específicas`);
	}
	if (/!(?:m[trblxy]?|p[trblxy]?|text|bg|border|w|h|rounded|flex|grid|gap|min|max|leading|tracking|shadow|ring|outline|opacity|z)-/.test(source)) {
		errors.push(`${relativePath}: prefixo Tailwind ! não é permitido`);
	}
	if (/StyleSheet\.create\s*\(/.test(source) && !ALLOWED_STYLESHEETS.has(relativePath)) {
		errors.push(`${relativePath}: StyleSheet.create não possui exceção registrada`);
	}
	if (relativePath.startsWith('components/') && relativePath.endsWith('.css') && !ALLOWED_COMPONENT_CSS.has(relativePath)) {
		errors.push(`${relativePath}: CSS de componente não possui exceção registrada`);
	}
}

for (const [relativePath, current] of Object.entries(fileMetrics)) {
	const baseline = FILE_DEBT_BASELINE[relativePath] ?? {
		inlineStyleProps: 0,
		rawHexLiterals: 0,
		arbitraryTailwindValues: 0,
		useScreenStyles: 0,
	};
	for (const metric of Object.keys(current)) {
		if (current[metric] > (baseline[metric] ?? 0)) {
			errors.push(
				`${relativePath}: ${metric} ${current[metric]} excede a dívida registrada ${baseline[metric] ?? 0}`,
			);
		}
	}
}

for (const [metric, baseline] of Object.entries(METRIC_BASELINE)) {
	if (metrics[metric] > baseline) {
		errors.push(`${metric}: ${metrics[metric]} excede a linha de base ${baseline}`);
	}
}

const exceptionsPath = path.join(ROOT, 'design-system/style-exceptions.json');
const exceptions = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));
for (const [index, exception] of exceptions.entries()) {
	for (const requiredField of ['files', 'reason', 'limitation', 'risk', 'alternative', 'owner']) {
		if (!exception[requiredField] || (requiredField === 'files' && !exception.files.length)) {
			errors.push(`style-exceptions.json[${index}]: campo obrigatório ausente: ${requiredField}`);
		}
	}
}

console.log('Style architecture metrics:', metrics);
if (errors.length) {
	console.error(errors.map(error => `- ${error}`).join('\n'));
	process.exitCode = 1;
} else {
	console.log('Style architecture check passed.');
}
