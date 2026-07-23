import { Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';

export const ASSISTANT_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

const bytesToBase64 = (bytes: Uint8Array) => {
	let binary = '';
	const chunkSize = 32_768;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
	}
	return globalThis.btoa(binary);
};

export const readAssistantAudioFile = async (uri: string) => {
	if (Platform.OS === 'web') {
		const response = await fetch(uri);
		const blob = await response.blob();
		if (blob.size > ASSISTANT_AUDIO_MAX_BYTES) throw new Error('O áudio ultrapassou 20 MB.');
		return {
			base64Audio: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
			mimeType: blob.type || 'audio/webm',
		};
	}
	const file = new ExpoFile(uri);
	const info = file.info();
	if (typeof info.size === 'number' && info.size > ASSISTANT_AUDIO_MAX_BYTES) {
		throw new Error('O áudio ultrapassou 20 MB.');
	}
	const extension = uri.split('?')[0]?.split('.').pop()?.toLocaleLowerCase('pt-BR');
	return {
		base64Audio: await file.base64(),
		mimeType: extension === 'webm' ? 'audio/webm' : extension === 'wav' ? 'audio/wav' : 'audio/mp4',
	};
};

export const deleteAssistantTemporaryAudio = (uri: string | null) => {
	if (!uri) return;
	if (Platform.OS === 'web') {
		if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
		return;
	}
	try {
		const file = new ExpoFile(uri);
		if (file.exists) file.delete();
	} catch {
		// O sistema operacional também pode ter removido o arquivo temporário.
	}
};
