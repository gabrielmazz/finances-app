import React from 'react';
import { auth } from '@/FirebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

// [[Gerenciamento de Bancos]]: somente a consulta vigente pode publicar o extrato.
export function useBankMovementsRequest(scope: string) {
	const { user } = useAuth();
	const personId = user?.uid ?? null;
	const currentScope = `${personId}:${scope}`;
	const scopeRef = React.useRef(currentScope);
	scopeRef.current = currentScope;
	const requestId = React.useRef(0);
	const mounted = React.useRef(true);
	const cancelRequest = React.useCallback(() => { requestId.current += 1; }, []);
	React.useEffect(() => {
		mounted.current = true;
		return () => { mounted.current = false; cancelRequest(); };
	}, [cancelRequest]);
	const beginRequest = React.useCallback(() => {
		const id = ++requestId.current;
		return () => mounted.current && id === requestId.current && scopeRef.current === currentScope
			&& auth.currentUser?.uid === personId;
	}, [currentScope, personId]);
	return { personId, beginRequest, cancelRequest };
}
