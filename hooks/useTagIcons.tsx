import React from 'react';
import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';

export type TagIconFamily = 'ionicons' | 'material-community' | 'font-awesome-6';
export type TagIconStyle = 'brand' | 'regular' | 'solid';

export type TagIconSelection = {
	iconFamily?: TagIconFamily | string | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | string | null;
};

export type TagIconOption = {
	key: string;
	label: string;
	iconFamily: TagIconFamily;
	iconName: string;
	iconStyle?: TagIconStyle;
};

type TagIconOptionBase = Omit<TagIconOption, 'key'>;

type TagIconProps = TagIconSelection & {
	size?: number;
	color?: string;
	style?: StyleProp<TextStyle>;
};

const iconLabelCollator = new Intl.Collator('pt-BR', {
	sensitivity: 'base',
});

const tagIconOptionsBase: TagIconOptionBase[] = [
	{ label: 'Academia', iconFamily: 'ionicons', iconName: 'fitness-outline' },
	{ label: 'Agua', iconFamily: 'ionicons', iconName: 'water-outline' },
	{ label: 'Airbnb', iconFamily: 'font-awesome-6', iconName: 'airbnb', iconStyle: 'brand' },
	{ label: 'Amazon', iconFamily: 'font-awesome-6', iconName: 'amazon', iconStyle: 'brand' },
	{ label: 'Apple', iconFamily: 'font-awesome-6', iconName: 'apple', iconStyle: 'brand' },
	{ label: 'Banco', iconFamily: 'material-community', iconName: 'bank-outline' },
	{ label: 'Bicicleta', iconFamily: 'ionicons', iconName: 'bicycle-outline' },
	{ label: 'Cafe', iconFamily: 'ionicons', iconName: 'cafe-outline' },
	{ label: 'Cachorro', iconFamily: 'material-community', iconName: 'dog' },
	{ label: 'Carro', iconFamily: 'ionicons', iconName: 'car-outline' },
	{ label: 'Cartao', iconFamily: 'ionicons', iconName: 'card-outline' },
	{ label: 'Casa', iconFamily: 'ionicons', iconName: 'home-outline' },
	{ label: 'Categoria', iconFamily: 'ionicons', iconName: 'pricetag-outline' },
	{ label: 'Celular', iconFamily: 'ionicons', iconName: 'phone-portrait-outline' },
	{ label: 'Compras', iconFamily: 'ionicons', iconName: 'cart-outline' },
	{ label: 'Condominio', iconFamily: 'material-community', iconName: 'home-city-outline' },
	{ label: 'Dinheiro', iconFamily: 'ionicons', iconName: 'cash-outline' },
	{ label: 'Discord', iconFamily: 'font-awesome-6', iconName: 'discord', iconStyle: 'brand' },
	{ label: 'Educacao', iconFamily: 'ionicons', iconName: 'school-outline' },
	{ label: 'Energia', iconFamily: 'ionicons', iconName: 'flash-outline' },
	{ label: 'Empresa', iconFamily: 'material-community', iconName: 'office-building-outline' },
	{ label: 'Facebook', iconFamily: 'font-awesome-6', iconName: 'facebook', iconStyle: 'brand' },
	{ label: 'Farmacia', iconFamily: 'material-community', iconName: 'pill' },
	{ label: 'Filmes', iconFamily: 'ionicons', iconName: 'film-outline' },
	{ label: 'Gato', iconFamily: 'material-community', iconName: 'cat' },
	{ label: 'GitHub', iconFamily: 'font-awesome-6', iconName: 'github', iconStyle: 'brand' },
	{ label: 'Google', iconFamily: 'font-awesome-6', iconName: 'google', iconStyle: 'brand' },
	{ label: 'Instagram', iconFamily: 'font-awesome-6', iconName: 'instagram', iconStyle: 'brand' },
	{ label: 'Investimento', iconFamily: 'material-community', iconName: 'cash-multiple' },
	{ label: 'Jogos', iconFamily: 'ionicons', iconName: 'game-controller-outline' },
	{ label: 'LinkedIn', iconFamily: 'font-awesome-6', iconName: 'linkedin', iconStyle: 'brand' },
	{ label: 'Loja', iconFamily: 'ionicons', iconName: 'storefront-outline' },
	{ label: 'Livro', iconFamily: 'ionicons', iconName: 'book-outline' },
	{ label: 'Mercado', iconFamily: 'material-community', iconName: 'shopping-outline' },
	{ label: 'Microsoft', iconFamily: 'font-awesome-6', iconName: 'microsoft', iconStyle: 'brand' },
	{ label: 'Minecraft', iconFamily: 'material-community', iconName: 'minecraft' },
	{ label: 'Musica', iconFamily: 'ionicons', iconName: 'musical-notes-outline' },
	{ label: 'Netflix', iconFamily: 'material-community', iconName: 'netflix' },
	{ label: 'Nintendo', iconFamily: 'material-community', iconName: 'nintendo-switch' },
	{ label: 'Nuvem', iconFamily: 'ionicons', iconName: 'cloud-outline' },
	{ label: 'Onibus', iconFamily: 'ionicons', iconName: 'bus-outline' },
	{ label: 'PayPal', iconFamily: 'font-awesome-6', iconName: 'paypal', iconStyle: 'brand' },
	{ label: 'Pet', iconFamily: 'ionicons', iconName: 'paw-outline' },
	{ label: 'Pix', iconFamily: 'font-awesome-6', iconName: 'pix', iconStyle: 'brand' },
	{ label: 'Pizza', iconFamily: 'ionicons', iconName: 'pizza-outline' },
	{ label: 'PlayStation', iconFamily: 'font-awesome-6', iconName: 'playstation', iconStyle: 'brand' },
	{ label: 'Presente', iconFamily: 'ionicons', iconName: 'gift-outline' },
	{ label: 'Restaurante', iconFamily: 'ionicons', iconName: 'restaurant-outline' },
	{ label: 'Sacola', iconFamily: 'ionicons', iconName: 'bag-handle-outline' },
	{ label: 'Saude', iconFamily: 'ionicons', iconName: 'medical-outline' },
	{ label: 'Shopify', iconFamily: 'font-awesome-6', iconName: 'shopify', iconStyle: 'brand' },
	{ label: 'Slack', iconFamily: 'font-awesome-6', iconName: 'slack', iconStyle: 'brand' },
	{ label: 'Snapchat', iconFamily: 'font-awesome-6', iconName: 'snapchat', iconStyle: 'brand' },
	{ label: 'Spotify', iconFamily: 'font-awesome-6', iconName: 'spotify', iconStyle: 'brand' },
	{ label: 'Steam', iconFamily: 'material-community', iconName: 'steam' },
	{ label: 'Stripe', iconFamily: 'font-awesome-6', iconName: 'stripe', iconStyle: 'brand' },
	{ label: 'Tecnologia', iconFamily: 'material-community', iconName: 'laptop' },
	{ label: 'TikTok', iconFamily: 'font-awesome-6', iconName: 'tiktok', iconStyle: 'brand' },
	{ label: 'Trabalho', iconFamily: 'material-community', iconName: 'briefcase-outline' },
	{ label: 'Trem', iconFamily: 'ionicons', iconName: 'train-outline' },
	{ label: 'Twitch', iconFamily: 'font-awesome-6', iconName: 'twitch', iconStyle: 'brand' },
	{ label: 'Uber', iconFamily: 'font-awesome-6', iconName: 'uber', iconStyle: 'brand' },
	{ label: 'Viagem', iconFamily: 'ionicons', iconName: 'airplane-outline' },
	{ label: 'WhatsApp', iconFamily: 'font-awesome-6', iconName: 'whatsapp', iconStyle: 'brand' },
	{ label: 'Xbox', iconFamily: 'font-awesome-6', iconName: 'xbox', iconStyle: 'brand' },
	{ label: 'YouTube', iconFamily: 'font-awesome-6', iconName: 'youtube', iconStyle: 'brand' },
	{ label: 'Abacaxi', iconFamily: 'material-community', iconName: 'fruit-pineapple' },
	{ label: 'Abelha', iconFamily: 'material-community', iconName: 'bee-flower' },
	{ label: 'Alarme', iconFamily: 'ionicons', iconName: 'alarm-outline' },
	{ label: 'Analitico', iconFamily: 'ionicons', iconName: 'analytics-outline' },
	{ label: 'Android', iconFamily: 'font-awesome-6', iconName: 'android', iconStyle: 'brand' },
	{ label: 'Arquivo', iconFamily: 'ionicons', iconName: 'archive-outline' },
	{ label: 'Atalho', iconFamily: 'ionicons', iconName: 'at-outline' },
	{ label: 'Aviao', iconFamily: 'material-community', iconName: 'airplane' },
	{ label: 'Aviao de papel', iconFamily: 'ionicons', iconName: 'paper-plane-outline' },
	{ label: 'Bandeira', iconFamily: 'font-awesome-6', iconName: 'flag', iconStyle: 'solid' },
	{ label: 'Barco', iconFamily: 'ionicons', iconName: 'boat-outline' },
	{ label: 'Barra', iconFamily: 'ionicons', iconName: 'bar-chart-outline' },
	{ label: 'Basquete', iconFamily: 'material-community', iconName: 'basketball' },
	{ label: 'Bateria', iconFamily: 'material-community', iconName: 'battery-outline' },
	{ label: 'Beach', iconFamily: 'material-community', iconName: 'beach' },
	{ label: 'Bed', iconFamily: 'ionicons', iconName: 'bed-outline' },
	{ label: 'Beer', iconFamily: 'ionicons', iconName: 'beer-outline' },
	{ label: 'Bitbucket', iconFamily: 'font-awesome-6', iconName: 'bitbucket', iconStyle: 'brand' },
	{ label: 'Bicicleta urbana', iconFamily: 'font-awesome-6', iconName: 'bicycle', iconStyle: 'solid' },
	{ label: 'Bluetooth', iconFamily: 'font-awesome-6', iconName: 'bluetooth', iconStyle: 'brand' },
	{ label: 'Bluesky', iconFamily: 'font-awesome-6', iconName: 'bluesky', iconStyle: 'brand' },
	{ label: 'Brilho', iconFamily: 'ionicons', iconName: 'sparkles-outline' },
	{ label: 'Bussola', iconFamily: 'ionicons', iconName: 'compass-outline' },
	{ label: 'Calculadora', iconFamily: 'ionicons', iconName: 'calculator-outline' },
	{ label: 'Calendario', iconFamily: 'ionicons', iconName: 'calendar-outline' },
	{ label: 'Camera', iconFamily: 'ionicons', iconName: 'camera-outline' },
	{ label: 'Camera retro', iconFamily: 'font-awesome-6', iconName: 'camera-retro', iconStyle: 'solid' },
	{ label: 'Caneta', iconFamily: 'material-community', iconName: 'pen' },
	{ label: 'Cesta', iconFamily: 'ionicons', iconName: 'basket-outline' },
	{ label: 'Chat', iconFamily: 'ionicons', iconName: 'chatbubble-ellipses-outline' },
	{ label: 'Chave', iconFamily: 'ionicons', iconName: 'key-outline' },
	{ label: 'Chef', iconFamily: 'material-community', iconName: 'chef-hat' },
	{ label: 'Chrome', iconFamily: 'font-awesome-6', iconName: 'chrome', iconStyle: 'brand' },
	{ label: 'Cinema', iconFamily: 'material-community', iconName: 'movie-roll' },
	{ label: 'Clipboard', iconFamily: 'ionicons', iconName: 'clipboard-outline' },
	{ label: 'Codigo', iconFamily: 'ionicons', iconName: 'code-slash-outline' },
	{ label: 'Coracao', iconFamily: 'ionicons', iconName: 'heart-circle-outline' },
	{ label: 'Corrida', iconFamily: 'material-community', iconName: 'run-fast' },
	{ label: 'Construcao', iconFamily: 'ionicons', iconName: 'construct-outline' },
	{ label: 'Controle', iconFamily: 'material-community', iconName: 'controller-classic-outline' },
	{ label: 'Credito', iconFamily: 'material-community', iconName: 'credit-card-outline' },
	{ label: 'Cubo', iconFamily: 'ionicons', iconName: 'cube-outline' },
	{ label: 'Cuidado medico', iconFamily: 'font-awesome-6', iconName: 'hospital', iconStyle: 'solid' },
	{ label: 'Cadeado', iconFamily: 'ionicons', iconName: 'lock-closed-outline' },
	{ label: 'Camiseta', iconFamily: 'material-community', iconName: 'tshirt-crew-outline' },
	{ label: 'Carro lateral', iconFamily: 'font-awesome-6', iconName: 'car-side', iconStyle: 'solid' },
	{ label: 'Carro esportivo', iconFamily: 'ionicons', iconName: 'car-sport-outline' },
	{ label: 'Cafe quente', iconFamily: 'material-community', iconName: 'coffee-outline' },
	{ label: 'Desktop', iconFamily: 'ionicons', iconName: 'desktop-outline' },
	{ label: 'Diamante', iconFamily: 'material-community', iconName: 'diamond-stone' },
	{ label: 'Docker', iconFamily: 'font-awesome-6', iconName: 'docker', iconStyle: 'brand' },
	{ label: 'Dropbox', iconFamily: 'font-awesome-6', iconName: 'dropbox', iconStyle: 'brand' },
	{ label: 'Dribbble', iconFamily: 'font-awesome-6', iconName: 'dribbble', iconStyle: 'brand' },
	{ label: 'Drama', iconFamily: 'material-community', iconName: 'drama-masks' },
	{ label: 'Earth', iconFamily: 'material-community', iconName: 'earth' },
	{ label: 'Edge', iconFamily: 'font-awesome-6', iconName: 'edge', iconStyle: 'brand' },
	{ label: 'Email', iconFamily: 'ionicons', iconName: 'mail-outline' },
	{ label: 'Envelope', iconFamily: 'material-community', iconName: 'email-outline' },
	{ label: 'Escritorio', iconFamily: 'ionicons', iconName: 'business-outline' },
	{ label: 'Escudo', iconFamily: 'ionicons', iconName: 'shield-checkmark-outline' },
	{ label: 'Estacionamento', iconFamily: 'material-community', iconName: 'parking' },
	{ label: 'Estatisticas', iconFamily: 'ionicons', iconName: 'stats-chart-outline' },
	{ label: 'Estrela', iconFamily: 'ionicons', iconName: 'star-outline' },
	{ label: 'Etiqueta', iconFamily: 'material-community', iconName: 'sale' },
	{ label: 'Extensao', iconFamily: 'ionicons', iconName: 'extension-puzzle-outline' },
	{ label: 'Favoritos', iconFamily: 'ionicons', iconName: 'bookmarks-outline' },
	{ label: 'Festa', iconFamily: 'material-community', iconName: 'party-popper' },
	{ label: 'Figma', iconFamily: 'font-awesome-6', iconName: 'figma', iconStyle: 'brand' },
	{ label: 'Fileira de arquivos', iconFamily: 'ionicons', iconName: 'file-tray-full-outline' },
	{ label: 'Firefox', iconFamily: 'font-awesome-6', iconName: 'firefox', iconStyle: 'brand' },
	{ label: 'Flor', iconFamily: 'ionicons', iconName: 'flower-outline' },
	{ label: 'Flor decorativa', iconFamily: 'material-community', iconName: 'flower-outline' },
	{ label: 'Foco', iconFamily: 'ionicons', iconName: 'eye-outline' },
	{ label: 'Fogo', iconFamily: 'ionicons', iconName: 'flame-outline' },
	{ label: 'Fogueira', iconFamily: 'ionicons', iconName: 'bonfire-outline' },
	{ label: 'Football', iconFamily: 'ionicons', iconName: 'football-outline' },
	{ label: 'Fones', iconFamily: 'material-community', iconName: 'headphones' },
	{ label: 'Futuro', iconFamily: 'font-awesome-6', iconName: 'gem', iconStyle: 'solid' },
	{ label: 'Gamepad', iconFamily: 'font-awesome-6', iconName: 'gamepad', iconStyle: 'solid' },
	{ label: 'GitLab', iconFamily: 'font-awesome-6', iconName: 'gitlab', iconStyle: 'brand' },
	{ label: 'Globo', iconFamily: 'font-awesome-6', iconName: 'globe', iconStyle: 'solid' },
	{ label: 'Guarda chuva', iconFamily: 'ionicons', iconName: 'umbrella-outline' },
	{ label: 'Guitarra', iconFamily: 'material-community', iconName: 'guitar-electric' },
	{ label: 'Headset', iconFamily: 'ionicons', iconName: 'headset-outline' },
	{ label: 'Imagem', iconFamily: 'ionicons', iconName: 'image-outline' },
	{ label: 'Impressora', iconFamily: 'ionicons', iconName: 'print-outline' },
	{ label: 'Ingresso', iconFamily: 'ionicons', iconName: 'ticket-outline' },
	{ label: 'Inseto', iconFamily: 'ionicons', iconName: 'bug-outline' },
	{ label: 'Jornal', iconFamily: 'ionicons', iconName: 'newspaper-outline' },
	{ label: 'Laptop premium', iconFamily: 'font-awesome-6', iconName: 'laptop', iconStyle: 'solid' },
	{ label: 'Luz', iconFamily: 'material-community', iconName: 'lightbulb-outline' },
	{ label: 'Localizacao', iconFamily: 'ionicons', iconName: 'location-outline' },
	{ label: 'Maca', iconFamily: 'material-community', iconName: 'food-apple-outline' },
	{ label: 'Mapa', iconFamily: 'ionicons', iconName: 'map-outline' },
	{ label: 'Marcador', iconFamily: 'material-community', iconName: 'map-marker-outline' },
	{ label: 'Martelo', iconFamily: 'ionicons', iconName: 'hammer-outline' },
	{ label: 'Martelo pesado', iconFamily: 'font-awesome-6', iconName: 'hammer', iconStyle: 'solid' },
	{ label: 'Medalha', iconFamily: 'ionicons', iconName: 'medal-outline' },
	{ label: 'Megafone', iconFamily: 'ionicons', iconName: 'megaphone-outline' },
	{ label: 'Metro', iconFamily: 'ionicons', iconName: 'subway-outline' },
	{ label: 'Microfone', iconFamily: 'ionicons', iconName: 'mic-outline' },
	{ label: 'Mundo', iconFamily: 'ionicons', iconName: 'earth-outline' },
	{ label: 'Lua', iconFamily: 'ionicons', iconName: 'moon-outline' },
	{ label: 'Natacao', iconFamily: 'material-community', iconName: 'swim' },
	{ label: 'Neve', iconFamily: 'ionicons', iconName: 'snow-outline' },
	{ label: 'Nutricao', iconFamily: 'ionicons', iconName: 'nutrition-outline' },
	{ label: 'Oculos', iconFamily: 'ionicons', iconName: 'glasses-outline' },
	{ label: 'Ovo', iconFamily: 'ionicons', iconName: 'egg-outline' },
	{ label: 'Paleta', iconFamily: 'ionicons', iconName: 'color-palette-outline' },
	{ label: 'Paleta artistica', iconFamily: 'material-community', iconName: 'palette-outline' },
	{ label: 'Paw', iconFamily: 'font-awesome-6', iconName: 'paw', iconStyle: 'solid' },
	{ label: 'Peixe', iconFamily: 'ionicons', iconName: 'fish-outline' },
	{ label: 'Pessoa', iconFamily: 'ionicons', iconName: 'person-outline' },
	{ label: 'Pessoas', iconFamily: 'ionicons', iconName: 'people-outline' },
	{ label: 'Pinterest', iconFamily: 'font-awesome-6', iconName: 'pinterest', iconStyle: 'brand' },
	{ label: 'Planeta', iconFamily: 'ionicons', iconName: 'planet-outline' },
	{ label: 'Podio', iconFamily: 'ionicons', iconName: 'podium-outline' },
	{ label: 'Premio', iconFamily: 'ionicons', iconName: 'ribbon-outline' },
	{ label: 'Presente card', iconFamily: 'material-community', iconName: 'wallet-giftcard' },
	{ label: 'Pulso', iconFamily: 'ionicons', iconName: 'pulse-outline' },
	{ label: 'Pulso cardiaco', iconFamily: 'material-community', iconName: 'heart-pulse' },
	{ label: 'Recibo', iconFamily: 'ionicons', iconName: 'receipt-outline' },
	{ label: 'Reddit', iconFamily: 'font-awesome-6', iconName: 'reddit', iconStyle: 'brand' },
	{ label: 'Relogio', iconFamily: 'material-community', iconName: 'watch-variant' },
	{ label: 'Rocket', iconFamily: 'ionicons', iconName: 'rocket-outline' },
	{ label: 'Rosa', iconFamily: 'ionicons', iconName: 'rose-outline' },
	{ label: 'Safari', iconFamily: 'font-awesome-6', iconName: 'safari', iconStyle: 'brand' },
	{ label: 'Skype', iconFamily: 'font-awesome-6', iconName: 'skype', iconStyle: 'brand' },
	{ label: 'Sofa', iconFamily: 'material-community', iconName: 'sofa-outline' },
	{ label: 'Sol', iconFamily: 'ionicons', iconName: 'sunny-outline' },
	{ label: 'Sorvete', iconFamily: 'ionicons', iconName: 'ice-cream-outline' },
	{ label: 'Telegram', iconFamily: 'font-awesome-6', iconName: 'telegram', iconStyle: 'brand' },
	{ label: 'Telescopio', iconFamily: 'ionicons', iconName: 'telescope-outline' },
	{ label: 'Tenis', iconFamily: 'ionicons', iconName: 'tennisball-outline' },
	{ label: 'Tenis esporte', iconFamily: 'material-community', iconName: 'tennis' },
	{ label: 'Terra', iconFamily: 'material-community', iconName: 'earth' },
	{ label: 'Trilha', iconFamily: 'ionicons', iconName: 'trail-sign-outline' },
	{ label: 'Trello', iconFamily: 'font-awesome-6', iconName: 'trello', iconStyle: 'brand' },
	{ label: 'TV retro', iconFamily: 'ionicons', iconName: 'tv-outline' },
	{ label: 'Vimeo', iconFamily: 'font-awesome-6', iconName: 'vimeo', iconStyle: 'brand' },
	{ label: 'Vinho', iconFamily: 'ionicons', iconName: 'wine-outline' },
	{ label: 'Wifi', iconFamily: 'material-community', iconName: 'wifi' },
	{ label: 'WordPress', iconFamily: 'font-awesome-6', iconName: 'wordpress', iconStyle: 'brand' },
];

export const buildTagIconKey = ({
	iconFamily,
	iconName,
	iconStyle,
}: {
	iconFamily: string;
	iconName: string;
	iconStyle?: string | null;
}) => `${iconFamily}:${iconName}:${iconStyle ?? 'default'}`;

export const TAG_ICON_OPTIONS: TagIconOption[] = [...tagIconOptionsBase]
	.sort((a, b) => iconLabelCollator.compare(a.label, b.label))
	.reduce<TagIconOption[]>((result, option) => {
		const key = buildTagIconKey(option);

		if (result.some(existingOption => existingOption.key === key)) {
			return result;
		}

		result.push({
			...option,
			key,
		});

		return result;
	}, []);

export const DEFAULT_TAG_ICON = TAG_ICON_OPTIONS.find(option => option.label === 'Categoria') ?? TAG_ICON_OPTIONS[0];

const tagIconOptionsMap = new Map(TAG_ICON_OPTIONS.map(option => [option.key, option]));

export function resolveTagIconSelection(selection?: TagIconSelection | null) {
	const iconFamily = selection?.iconFamily ?? null;
	const iconName = selection?.iconName ?? null;
	const iconStyle = selection?.iconStyle ?? null;

	if (iconFamily && iconName) {
		const exactMatch = tagIconOptionsMap.get(
			buildTagIconKey({
				iconFamily,
				iconName,
				iconStyle,
			}),
		);

		if (exactMatch) {
			return exactMatch;
		}

		const looseMatch = TAG_ICON_OPTIONS.find(
			option => option.iconFamily === iconFamily && option.iconName === iconName,
		);

		if (looseMatch) {
			return looseMatch;
		}
	}

	return DEFAULT_TAG_ICON;
}

export function serializeTagIconSelection(selection?: TagIconSelection | null) {
	const resolved = resolveTagIconSelection(selection);

	return {
		iconFamily: resolved.iconFamily,
		iconName: resolved.iconName,
		iconStyle: resolved.iconStyle ?? null,
	};
}

export function TagIcon({
	iconFamily,
	iconName,
	iconStyle,
	size = 20,
	color = '#0F172A',
	style,
}: TagIconProps) {
	const resolved = resolveTagIconSelection({
		iconFamily,
		iconName,
		iconStyle,
	});

	if (resolved.iconFamily === 'material-community') {
		return (
			<MaterialCommunityIcons
				name={resolved.iconName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
				size={size}
				color={color}
				style={style}
			/>
		);
	}

	if (resolved.iconFamily === 'font-awesome-6') {
		return (
			<FontAwesome6
				name={resolved.iconName as React.ComponentProps<typeof FontAwesome6>['name']}
				size={size}
				color={color}
				style={style}
				brand={resolved.iconStyle === 'brand'}
				regular={resolved.iconStyle === 'regular'}
				solid={resolved.iconStyle === 'solid'}
			/>
		);
	}

	return (
		<Ionicons
			name={resolved.iconName as React.ComponentProps<typeof Ionicons>['name']}
			size={size}
			color={color}
			style={style}
		/>
	);
}

export function useTagIcons() {
	const iconOptions = React.useMemo(() => TAG_ICON_OPTIONS, []);

	const resolveTagIcon = React.useCallback((selection?: TagIconSelection | null) => {
		return resolveTagIconSelection(selection);
	}, []);

	const getTagIconLabel = React.useCallback((selection?: TagIconSelection | null) => {
		return resolveTagIconSelection(selection).label;
	}, []);

	const serializeTagIcon = React.useCallback((selection?: TagIconSelection | null) => {
		return serializeTagIconSelection(selection);
	}, []);

	return {
		iconOptions,
		defaultTagIcon: DEFAULT_TAG_ICON,
		resolveTagIcon,
		getTagIconLabel,
		serializeTagIcon,
	};
}
