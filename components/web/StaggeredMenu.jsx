import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import './StaggeredMenu.css';

// O Navigator Web é remontado quando o Expo Router troca de tela. Mantemos
// somente o estado visual da rail entre essas remontagens para que navegar não
// force o menu aberto a voltar para o estado fechado.
let collapsedRailOpen = false;
let activeMenuInstance = null;

export const StaggeredMenu = ({
  position = 'right',
  colors = ['#B497CF', '#5227FF'],
  items = [],
  socialItems = [],
  displaySocials = true,
  displayItemNumbering = true,
  collapsedRail = false,
  profile,
  className,
  navigationLabel = 'Navegação principal',
  menuButtonColor = '#fff',
  openMenuButtonColor = '#fff',
  accentColor = '#5227FF',
  changeMenuColorOnOpen = true,
  isFixed = false,
  closeOnClickAway = true,
  onMenuOpen,
  onMenuClose
}) => {
  const initialOpen = collapsedRail && collapsedRailOpen;
  const [open, setOpen] = useState(initialOpen);
  const openRef = useRef(initialOpen);
  const menuInstanceRef = useRef({});
  const panelRef = useRef(null);
  const preLayersRef = useRef(null);
  const preLayerElsRef = useRef([]);
  const plusHRef = useRef(null);
  const plusVRef = useRef(null);
  const iconRef = useRef(null);
  const textInnerRef = useRef(null);
  const textWrapRef = useRef(null);
  const [textLines, setTextLines] = useState(['Menu', 'Fechar']);

  const openTlRef = useRef(null);
  const closeTweenRef = useRef(null);
  const spinTweenRef = useRef(null);
  const textCycleAnimRef = useRef(null);
  const colorTweenRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const busyRef = useRef(false);
  const prefersReducedMotionRef = useRef(false);

  const getCollapsedClip = useCallback(panel => {
    const railWidth = 68;
    return `inset(0 ${Math.max(panel.offsetWidth - railWidth, 0)}px 0 0 round 0 14px 14px 0)`;
  }, []);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panel = panelRef.current;
      const preContainer = preLayersRef.current;
      const plusH = plusHRef.current;
      const plusV = plusVRef.current;
      const icon = iconRef.current;
      const textInner = textInnerRef.current;
      if (!panel || !plusH || !plusV || !icon || !textInner) return;

      let preLayers = [];
      if (preContainer) {
        preLayers = Array.from(preContainer.querySelectorAll('.sm-prelayer'));
      }
      preLayerElsRef.current = preLayers;

      const offscreen = position === 'left' ? -100 : 100;
      if (collapsedRail) {
        gsap.set(panel, {
          xPercent: 0,
          opacity: 1,
          clipPath: openRef.current ? 'inset(0 0px 0 0 round 0 14px 14px 0)' : getCollapsedClip(panel)
        });
        gsap.set(preLayers, { xPercent: openRef.current ? 0 : offscreen, autoAlpha: 1 });
      } else {
        gsap.set([panel, ...preLayers], { xPercent: offscreen, opacity: 1, clearProps: 'clipPath' });
      }
      if (preContainer) {
        gsap.set(preContainer, { xPercent: 0, opacity: 1 });
      }
      gsap.set(plusH, { transformOrigin: '50% 50%', rotate: 0 });
      gsap.set(plusV, { transformOrigin: '50% 50%', rotate: 90 });
      gsap.set(icon, { rotate: 0, transformOrigin: '50% 50%' });
      gsap.set(textInner, { yPercent: 0 });
      if (toggleBtnRef.current) gsap.set(toggleBtnRef.current, { color: menuButtonColor });
    });
    return () => ctx.revert();
  }, [collapsedRail, getCollapsedClip, menuButtonColor, position]);

  useLayoutEffect(() => {
    activeMenuInstance = menuInstanceRef.current;
    return () => {
      if (activeMenuInstance === menuInstanceRef.current) {
        activeMenuInstance = null;
      }
    };
  }, []);

  const buildOpenTimeline = useCallback(() => {
    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return null;

    openTlRef.current?.kill();
    if (closeTweenRef.current) {
      closeTweenRef.current.kill();
      closeTweenRef.current = null;
    }
    const socialTitle = panel.querySelector('.sm-socials-title');
    const socialLinks = Array.from(panel.querySelectorAll('.sm-socials-link'));

    const offscreen = position === 'left' ? -100 : 100;
    const layerStates = layers.map(el => ({ el, start: offscreen }));
    const panelStart = offscreen;

    if (socialTitle) {
      gsap.set(socialTitle, { opacity: 0 });
    }
    if (socialLinks.length) {
      gsap.set(socialLinks, { y: 25, opacity: 0 });
    }

    const lastLayerStart = layerStates.length ? (layerStates.length - 1) * 0.07 : 0;
    const panelInsertTime = lastLayerStart + (layerStates.length ? 0.08 : 0);
    const panelDuration = 0.65;
    const tl = gsap.timeline({ paused: true });

    if (collapsedRail) {
      layerStates.forEach((ls, i) => {
        tl.fromTo(ls.el, { xPercent: ls.start }, { xPercent: 0, duration: 0.5, ease: 'power4.out' }, i * 0.07);
      });
      tl.to(panel, {
        clipPath: 'inset(0 0px 0 0 round 0 14px 14px 0)',
        duration: panelDuration,
        ease: 'power4.out',
        overwrite: 'auto'
      }, panelInsertTime);
    } else {
      layerStates.forEach((ls, i) => {
        tl.fromTo(ls.el, { xPercent: ls.start }, { xPercent: 0, duration: 0.5, ease: 'power4.out' }, i * 0.07);
      });
      tl.fromTo(
        panel,
        { xPercent: panelStart },
        { xPercent: 0, duration: panelDuration, ease: 'power4.out' },
        panelInsertTime
      );
    }

    if (socialTitle || socialLinks.length) {
      const socialsStart = panelInsertTime + panelDuration * 0.4;
      if (socialTitle) {
        tl.to(
          socialTitle,
          {
            opacity: 1,
            duration: 0.5,
            ease: 'power2.out'
          },
          socialsStart
        );
      }
      if (socialLinks.length) {
        tl.to(
          socialLinks,
          {
            y: 0,
            opacity: 1,
            duration: 0.55,
            ease: 'power3.out',
            onComplete: () => {
              gsap.set(socialLinks, { clearProps: 'opacity' });
            }
          },
          socialsStart + 0.04
        );
      }
    }

    openTlRef.current = tl;
    return tl;
  }, [collapsedRail, position]);

  const playOpen = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    const tl = buildOpenTimeline();
    if (tl) {
      tl.eventCallback('onComplete', () => {
        busyRef.current = false;
      });
      if (prefersReducedMotionRef.current) {
        tl.progress(1);
      } else {
        tl.play(0);
      }
    } else {
      busyRef.current = false;
    }
  }, [buildOpenTimeline]);

  const playClose = useCallback(() => {
    openTlRef.current?.kill();
    openTlRef.current = null;
    const panel = panelRef.current;
    if (!panel) return;

    closeTweenRef.current?.kill();
    const layers = preLayerElsRef.current;
    const offscreen = position === 'left' ? -100 : 100;
    const panelDuration = collapsedRail ? 0.55 : 0.65;
    const finishClose = () => {
      const socialTitle = panel.querySelector('.sm-socials-title');
      const socialLinks = Array.from(panel.querySelectorAll('.sm-socials-link'));
      if (socialTitle) gsap.set(socialTitle, { opacity: 0 });
      if (socialLinks.length) gsap.set(socialLinks, { y: 25, opacity: 0 });
      busyRef.current = false;
    };

    const closeTimeline = gsap.timeline({ paused: true, onComplete: finishClose });

    if (collapsedRail) {
      layers.forEach((layer, index) => {
        closeTimeline.fromTo(
          layer,
          { xPercent: 0 },
          {
            xPercent: offscreen,
            duration: prefersReducedMotionRef.current ? 0 : 0.5,
            ease: 'power4.in',
            overwrite: 'auto'
          },
          index * 0.07
        );
      });
      closeTimeline.fromTo(
        panel,
        { clipPath: 'inset(0 0px 0 0 round 0 14px 14px 0)' },
        {
          clipPath: getCollapsedClip(panel),
          duration: prefersReducedMotionRef.current ? 0 : panelDuration,
          ease: 'power4.in',
          overwrite: 'auto'
        },
        0
      );
    } else {
      closeTimeline.fromTo(
        [...layers, panel],
        { xPercent: 0 },
        {
          xPercent: offscreen,
          duration: prefersReducedMotionRef.current ? 0 : 0.32,
          ease: 'power3.in',
          overwrite: 'auto'
        },
        0
      );
    }

    if (prefersReducedMotionRef.current) {
      closeTimeline.progress(1);
      finishClose();
    } else {
      closeTimeline.play(0);
    }
    closeTweenRef.current = closeTimeline;
  }, [collapsedRail, getCollapsedClip, position]);

  const animateIcon = useCallback(opening => {
    const icon = iconRef.current;
    if (!icon) return;
    spinTweenRef.current?.kill();
    if (opening) {
      spinTweenRef.current = gsap.to(icon, {
        rotate: 225,
        duration: prefersReducedMotionRef.current ? 0 : 0.8,
        ease: 'power4.out',
        overwrite: 'auto'
      });
    } else {
      spinTweenRef.current = gsap.to(icon, {
        rotate: 0,
        duration: prefersReducedMotionRef.current ? 0 : 0.35,
        ease: 'power3.inOut',
        overwrite: 'auto'
      });
    }
  }, []);

  const animateColor = useCallback(
    opening => {
      const btn = toggleBtnRef.current;
      if (!btn) return;
      colorTweenRef.current?.kill();
      if (changeMenuColorOnOpen) {
        const targetColor = opening ? openMenuButtonColor : menuButtonColor;
        colorTweenRef.current = gsap.to(btn, {
          color: targetColor,
          delay: prefersReducedMotionRef.current ? 0 : 0.18,
          duration: prefersReducedMotionRef.current ? 0 : 0.3,
          ease: 'power2.out'
        });
      } else {
        gsap.set(btn, { color: menuButtonColor });
      }
    },
    [openMenuButtonColor, menuButtonColor, changeMenuColorOnOpen]
  );

  React.useEffect(() => {
    if (toggleBtnRef.current) {
      if (changeMenuColorOnOpen) {
        const targetColor = openRef.current ? openMenuButtonColor : menuButtonColor;
        gsap.set(toggleBtnRef.current, { color: targetColor });
      } else {
        gsap.set(toggleBtnRef.current, { color: menuButtonColor });
      }
    }
  }, [changeMenuColorOnOpen, menuButtonColor, openMenuButtonColor]);

  React.useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;

    const updatePreference = () => {
      prefersReducedMotionRef.current = media.matches;
    };

    updatePreference();
    media.addEventListener?.('change', updatePreference);
    return () => media.removeEventListener?.('change', updatePreference);
  }, []);

  const animateText = useCallback(opening => {
    const inner = textInnerRef.current;
    if (!inner) return;
    textCycleAnimRef.current?.kill();

    const currentLabel = opening ? 'Menu' : 'Fechar';
    const targetLabel = opening ? 'Fechar' : 'Menu';
    if (prefersReducedMotionRef.current) {
      setTextLines([targetLabel]);
      gsap.set(inner, { yPercent: 0 });
      return;
    }
    const cycles = 3;
    const seq = [currentLabel];
    let last = currentLabel;
    for (let i = 0; i < cycles; i++) {
      last = last === 'Menu' ? 'Fechar' : 'Menu';
      seq.push(last);
    }
    if (last !== targetLabel) seq.push(targetLabel);
    seq.push(targetLabel);
    setTextLines(seq);

    gsap.set(inner, { yPercent: 0 });
    const lineCount = seq.length;
    const finalShift = ((lineCount - 1) / lineCount) * 100;
    textCycleAnimRef.current = gsap.to(inner, {
      yPercent: -finalShift,
      duration: 0.5 + lineCount * 0.07,
      ease: 'power4.out'
    });
  }, []);

  const toggleMenu = useCallback(() => {
    const target = !openRef.current;
    openRef.current = target;
    if (collapsedRail) collapsedRailOpen = target;
    setOpen(target);
    if (target) {
      onMenuOpen?.();
      playOpen();
    } else {
      onMenuClose?.();
      playClose();
    }
    animateIcon(target);
    animateColor(target);
    animateText(target);
  }, [playOpen, playClose, animateIcon, animateColor, animateText, onMenuOpen, onMenuClose]);

  const closeMenu = useCallback(() => {
    if (activeMenuInstance !== menuInstanceRef.current) return;
    if (openRef.current) {
      openRef.current = false;
      if (collapsedRail) collapsedRailOpen = false;
      setOpen(false);
      onMenuClose?.();
      playClose();
      animateIcon(false);
      animateColor(false);
      animateText(false);
    }
  }, [playClose, animateIcon, animateColor, animateText, onMenuClose]);

  React.useEffect(() => {
    if (!closeOnClickAway || !open) return;

    const handleClickOutside = event => {
      if (activeMenuInstance !== menuInstanceRef.current) return;
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(event.target)
      ) {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [closeOnClickAway, open, closeMenu]);

  React.useEffect(() => {
    if (!open) return;

    const handleEscape = event => {
      if (activeMenuInstance !== menuInstanceRef.current) return;
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeMenu, open]);

  return (
    <div
      className={(className ? className + ' ' : '') + 'staggered-menu-wrapper' + (isFixed ? ' fixed-wrapper' : '')}
      style={accentColor ? { ['--sm-accent']: accentColor } : undefined}
      data-position={position}
      data-open={open || undefined}
      data-collapsed-rail={collapsedRail || undefined}
    >
      <div
        ref={preLayersRef}
        className="sm-prelayers"
        aria-hidden="true"
        style={position === 'left' ? { left: 0, right: 'auto' } : { left: 'auto', right: 0 }}
      >
        {(() => {
          const raw = colors && colors.length ? colors.slice(0, 4) : ['#1e1e22', '#35353c'];
          let arr = [...raw];
          if (arr.length >= 3) {
            const mid = Math.floor(arr.length / 2);
            arr.splice(mid, 1);
          }
          return arr.map((c, i) => <div key={i} className="sm-prelayer" style={{ background: c }} />);
        })()}
      </div>
      <header className="staggered-menu-header" aria-label={navigationLabel}>
        <button
          ref={toggleBtnRef}
          className="sm-toggle"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          aria-controls="staggered-menu-panel"
          onClick={toggleMenu}
          type="button"
        >
          <span ref={textWrapRef} className="sm-toggle-textWrap" aria-hidden="true">
            <span ref={textInnerRef} className="sm-toggle-textInner">
              {textLines.map((l, i) => (
                <span className="sm-toggle-line" key={i}>
                  {l}
                </span>
              ))}
            </span>
          </span>
          <span ref={iconRef} className="sm-icon" aria-hidden="true">
            <span ref={plusHRef} className="sm-icon-line" />
            <span ref={plusVRef} className="sm-icon-line sm-icon-line-v" />
          </span>
        </button>
      </header>

      <aside
        id="staggered-menu-panel"
        ref={panelRef}
        className="staggered-menu-panel"
        aria-hidden={!open && !collapsedRail}
        style={position === 'left' ? { left: 0, right: 'auto' } : { left: 'auto', right: 0 }}
      >
        <div className="sm-panel-inner">
          <ul className="sm-panel-list" role="list" data-numbering={displayItemNumbering || undefined}>
            {items && items.length ? (
              items.map((it, idx) => (
                it.type === 'section' ? (
                  <li className="sm-panel-section" key={it.label + idx} aria-hidden="true">
                    {it.label}
                  </li>
                ) : it.type === 'action' ? (
                  <li className="sm-panel-itemWrap" key={it.label + idx}>
                    <button
                      className="sm-panel-item sm-panel-action"
                      type="button"
                      aria-label={it.ariaLabel || it.label}
                      tabIndex={(open || collapsedRail) && !it.disabled ? undefined : -1}
                      disabled={it.disabled}
                      onClick={() => {
                        it.onSelect?.();
                        closeMenu();
                      }}
                    >
                      <span className="sm-panel-itemLabel">
                        {it.icon ? <span className="sm-panel-itemIcon" aria-hidden="true">{it.icon}</span> : null}
                        <span>{it.label}</span>
                      </span>
                    </button>
                  </li>
                ) : (
                  <li className="sm-panel-itemWrap" key={it.label + idx}>
                    <a
                      className="sm-panel-item"
                      href={it.link || '#'}
                      aria-label={it.ariaLabel || it.label}
                      aria-current={it.isActive ? 'page' : undefined}
                      aria-disabled={it.disabled || undefined}
                      data-index={idx + 1}
                      data-active={it.isActive || undefined}
                      tabIndex={(open || collapsedRail) && !it.disabled ? undefined : -1}
                      onClick={event => {
                        if (
                          event.defaultPrevented ||
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        ) {
                          return;
                        }
                        event.preventDefault();
                        if (it.disabled) return;
                        it.onSelect?.();
                      }}
                    >
                      <span className="sm-panel-itemLabel">
                        {it.icon ? <span className="sm-panel-itemIcon" aria-hidden="true">{it.icon}</span> : null}
                        <span>{it.label}</span>
                      </span>
                    </a>
                  </li>
                )
              ))
            ) : (
              <li className="sm-panel-itemWrap" aria-hidden="true">
                <span className="sm-panel-item">
                  <span className="sm-panel-itemLabel">No items</span>
                </span>
              </li>
            )}
          </ul>
          {displaySocials && socialItems && socialItems.length > 0 && (
            <div className="sm-socials" aria-label="Social links">
              <h3 className="sm-socials-title">Socials</h3>
              <ul className="sm-socials-list" role="list">
                {socialItems.map((s, i) => (
                  <li key={s.label + i} className="sm-socials-item">
                    <a href={s.link} target="_blank" rel="noopener noreferrer" className="sm-socials-link">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {profile && (
            <div className="sm-profile" aria-label="Usuário conectado">
              <span className="sm-profile-avatar" aria-hidden="true">
                {profile.imageUrl ? <img src={profile.imageUrl} alt="" /> : profile.initials}
              </span>
              <span className="sm-profile-copy">
                <strong>{profile.name}</strong>
                {profile.subtitle ? <small>{profile.subtitle}</small> : null}
              </span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default StaggeredMenu;
