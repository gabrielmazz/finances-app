import { readonlyClient,releaseManifest } from '../script/production-readiness.cjs';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

describe('production preparation has no destructive API',()=>{
	it('rejects account changes and foreign endpoints before any request',async()=>{
		const client=readonlyClient('synthetic-operator-token');
		await expect(client('https://identitytoolkit.googleapis.com/v1/projects/finances-app-e8685/accounts:update',{localId:'synthetic'})).rejects.toThrow('forbidden');
		await expect(client('https://example.com/finances-app-e8685')).rejects.toThrow('Unexpected');
		await expect(client('https://firestore.googleapis.com/v1/projects/another-project/databases/(default)')).rejects.toThrow('Unexpected');
		await expect(client('https://firestore.googleapis.com/v1/projects/finances-app-e8685-foreign/databases/(default)')).rejects.toThrow('Unexpected');
		expect(()=>readonlyClient('')).toThrow('short-lived');
	});
	it('keeps production blocked until the exact tested source is actually published on Spark',()=>{
		const digest=createHash('sha256').update(fs.readFileSync('firestore.rules')).digest('hex');
		const inspection={publishedRules:{sha256:'old'},billingEnabled:false,database:{edition:'STANDARD',freeTier:true},auth:{emailPasswordEnabled:true},sdk:{appId:'existing',authDomain:'existing.firebaseapp.com'},checkedAt:new Date().toISOString()};
		expect(releaseManifest(inspection).published).toBe(false);
		expect(releaseManifest({...inspection,publishedRules:{sha256:digest}}).published).toBe(true);
		expect(releaseManifest({...inspection,publishedRules:{sha256:digest},billingEnabled:true}).published).toBe(false);
	});
});
