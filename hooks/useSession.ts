import { unavailableUser } from '@/types/presentation/session';
// Apenas estado de apresentação; não cria uma sessão nem uma identidade de teste.
export function useSession() {
	return { user: unavailableUser };
}
