import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components/native';

const TAB_WIDTH = 130;
const TAB_HEIGHT = 28;
const TAB_PADDING = 2;
const DEFAULT_LABELS = ['Profile', 'Settings', 'Notifications'] as const;

type MenuProps = {
  labels?: readonly string[];
  defaultIndex?: number;
  onChange?: (index: number, label: string) => void;
};

const normalizeIndex = (index: number, total: number) => {
  if (total <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= total) {
    return total - 1;
  }
  return index;
};

export const Menu: React.FC<MenuProps> = ({
  labels,
  defaultIndex = 0,
  onChange,
}) => {
  const resolvedLabels = useMemo(
    () => (labels && labels.length > 0 ? [...labels] : [...DEFAULT_LABELS]),
    [labels],
  );
  const labelCount = resolvedLabels.length;
  const [activeIndex, setActiveIndex] = useState(() =>
    normalizeIndex(defaultIndex, labelCount),
  );

  useEffect(() => {
    setActiveIndex(prev => normalizeIndex(prev, labelCount));
  }, [labelCount]);

  useEffect(() => {
    setActiveIndex(normalizeIndex(defaultIndex, labelCount));
  }, [defaultIndex, labelCount]);

  if (resolvedLabels.length === 0) {
    return null;
  }

  const handlePress = (index: number) => {
    setActiveIndex(index);
    onChange?.(index, resolvedLabels[index]);
  };

  return (
    <StyledWrapper>
      <TabContainer>
        <Indicator left={TAB_PADDING + activeIndex * TAB_WIDTH} />
        {resolvedLabels.map((label, index) => (
          <TabButton
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeIndex === index }}
            onPress={() => handlePress(index)}
          >
            <TabLabel active={activeIndex === index}>{label}</TabLabel>
          </TabButton>
        ))}
      </TabContainer>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.View({
  width: '100%',
  alignItems: 'center',
  paddingVertical: 16,
});

const TabContainer = styled.View({
  position: 'relative',
  flexDirection: 'row',
  alignItems: 'center',
  padding: TAB_PADDING,
  backgroundColor: '#dadadb',
  borderRadius: 9,
});

const Indicator = styled.View<{ left: number }>(({ left }) => ({
  position: 'absolute',
  top: TAB_PADDING,
  left,
  width: TAB_WIDTH,
  height: TAB_HEIGHT,
  backgroundColor: '#ffffff',
  borderRadius: 7,
  borderWidth: 0.5,
  borderColor: 'rgba(0, 0, 0, 0.04)',
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
}));

const TabButton = styled.Pressable({
  width: TAB_WIDTH,
  height: TAB_HEIGHT,
  alignItems: 'center',
  justifyContent: 'center',
});

const TabLabel = styled.Text<{ active: boolean }>(({ active }) => ({
  fontSize: 12,
  opacity: active ? 1 : 0.6,
  fontWeight: '500',
  color: '#000',
}));
