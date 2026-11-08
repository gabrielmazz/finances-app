# Lumus Finanças

Frontend Expo/React Native preservado para a reconstrução independente do backend. Telas, formulários, gráficos, navegação, estilos e variantes Web/mobile continuam no projeto. Consultas, autenticação e operações de dados estão temporariamente indisponíveis.

## Executar localmente

Requer Node >=22.13.0 e npm.

```bash
npm ci
npm start
# Navegador:
npm run web
```

Não é necessário `.env`, Firebase, credenciais ou emuladores de serviços. No login visual, use **Explorar telas**. Nenhuma conta é criada e nenhuma operação financeira é simulada. Tema, privacidade visual e preferências de navegação permanecem locais.

## Verificar e exportar

```bash
npm run check
npm run web:export
npm run web:serve
```

O último comando serve `dist/` em `http://127.0.0.1:4173`. Para validar bundles nativos, use `npx expo export --platform android` ou `--platform ios`; isso não equivale a instalar/testar em dispositivo.

## Documentação e recuperação

[Arquitetura.md](Arquitetura.md) descreve as fronteiras atuais. [Relatório da remoção](Arquitetura/Remoção%20do%20Backend.md) registra inventário, recuperação, verificações e limitações. O manifesto exato está em [docs/backend-removal-manifest.json](docs/backend-removal-manifest.json).

O estado anterior está na tag `recovery/backend-removal-20261108`. Há também bundle Git e cópia das configurações locais em `/programacao/finances-app-recovery-20261108`, fora do código ativo. Nenhum projeto, banco, documento, conta, credencial externa ou recurso de nuvem foi alterado.
