import { seedSparkDemo } from './lib/sparkDemo';

seedSparkDemo().catch(error => { console.error(error.message); process.exitCode = 1; });
