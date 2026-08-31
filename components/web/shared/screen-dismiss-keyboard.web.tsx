import React from 'react';

/** O navegador já administra o foco; não envolve a tela em um touch handler. */
export function ScreenDismissKeyboard({ children }: React.PropsWithChildren) {
	return <>{children}</>;
}
