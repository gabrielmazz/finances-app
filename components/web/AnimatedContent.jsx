import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const AnimatedContent = ({
  children,
  container,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  disappearReverse = reverse,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  disappearScale = 0.8,
  threshold = 0.1,
  delay = 0,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = 'power3.in',
  trigger = 'scroll',
  onComplete,
  onDisappearanceComplete,
  visible = true,
  className = '',
  ...props
}) => {
  const ref = useRef(null);
	const onCompleteRef = useRef(onComplete);
	const onDisappearanceCompleteRef = useRef(onDisappearanceComplete);
	onCompleteRef.current = onComplete;
	onDisappearanceCompleteRef.current = onDisappearanceComplete;
	const domStyle = Array.isArray(props.style)
		? Object.assign({}, ...props.style.filter(Boolean))
		: props.style;
	const { style: _style, ...domProps } = props;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let scrollerTarget = container || document.getElementById('snap-main-container') || null;

    if (typeof scrollerTarget === 'string') {
      scrollerTarget = document.querySelector(scrollerTarget);
    }

    const axis = direction === 'horizontal' ? 'x' : 'y';
    const offset = reverse ? -distance : distance;
    const exitOffset = disappearReverse ? distance : -distance;
    const startPct = (1 - threshold) * 100;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      gsap.set(el, {
        [axis]: visible ? 0 : exitOffset,
        scale: visible ? 1 : disappearScale,
        opacity: visible ? 1 : (animateOpacity ? initialOpacity : 0),
        visibility: 'visible',
      });
		if (!visible) onDisappearanceCompleteRef.current?.();
      return undefined;
    }

	gsap.killTweensOf(el);

	if (!visible) {
		const exitTween = gsap.to(el, {
			[axis]: exitOffset,
			scale: disappearScale,
			opacity: animateOpacity ? initialOpacity : 0,
			duration: disappearDuration,
			ease: disappearEase,
			onComplete: () => onDisappearanceCompleteRef.current?.(),
		});
		return () => exitTween.kill();
	}

    gsap.set(el, {
      [axis]: offset,
      scale,
      opacity: animateOpacity ? initialOpacity : 1,
      visibility: 'visible'
    });

    const tl = gsap.timeline({
      paused: true,
      delay,
      onComplete: () => {
        onCompleteRef.current?.();
        if (disappearAfter > 0) {
          gsap.to(el, {
            [axis]: exitOffset,
            scale: disappearScale,
            opacity: animateOpacity ? initialOpacity : 0,
            delay: disappearAfter,
            duration: disappearDuration,
            ease: disappearEase,
            onComplete: () => onDisappearanceCompleteRef.current?.()
          });
        }
      }
    });

    tl.to(el, {
      [axis]: 0,
      scale: 1,
      opacity: 1,
      duration,
      ease
    });

    if (trigger === 'mount') {
      tl.play();
      return () => tl.kill();
    }

    const st = ScrollTrigger.create({
      trigger: el,
      scroller: scrollerTarget,
      start: `top ${startPct}%`,
      once: true,
      onEnter: () => tl.play()
    });

    return () => {
      st.kill();
      tl.kill();
    };
  }, [
    container,
    distance,
    direction,
    reverse,
    disappearReverse,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    scale,
    disappearScale,
    threshold,
    delay,
    disappearAfter,
    disappearDuration,
    disappearEase,
    trigger,
    visible,
  ]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ visibility: 'hidden', ...(domStyle || {}) }}
      {...domProps}
    >
      {children}
    </div>
  );
};

export default AnimatedContent;
