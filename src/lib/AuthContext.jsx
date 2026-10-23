import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { supabase, base44 } from '@/api/base44Client';

const AuthContext = createContext();

// The first screen waits for this check, so it must always end (owner, 23
// October 2026: in Safari the spinner could stay up for good when a sign-in
// request was left unanswered). Each request has its own limit
// (base44Client.js); past this, the check stops waiting and the app says it
// couldn't reach the server, with a way to try again.
export const SIGN_IN_CHECK_LIMIT_MS = 15_000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);
  // Which check is the latest (an older one that ends late is ignored), and
  // whether it's still waiting.
  const checkId = useRef(0);
  const waiting = useRef(false);

  useEffect(() => {
    checkUserAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        let profile = null;
        try {
          profile = await base44.auth.me();
        } catch (error) {
          // No answer isn't "signed out": a tab coming back into view after a
          // sleep must not lose the person it was showing (review, 23 Oct).
          if (error?.unreachable) return;
        }
        setUser(profile);
        setIsAuthenticated(!!profile);
        // The server answered: that settles the start-up check too, even if
        // its own requests are still hanging, and there's no "couldn't
        // reach" screen.
        if (profile) {
          checkId.current += 1;
          waiting.current = false;
          setAuthError(null);
          setIsLoadingAuth(false);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError(null);
      }
      setAuthChecked(true);
    });

    return () => listener?.subscription?.unsubscribe();
  }, []);

  const checkUserAuth = useCallback(async () => {
    const id = ++checkId.current;
    waiting.current = true;
    setIsLoadingAuth(true);
    setAuthError(null);
    let timer;
    const outOfTime = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('unreachable'), { unreachable: true })), SIGN_IN_CHECK_LIMIT_MS);
    });
    try {
      const currentUser = await Promise.race([base44.auth.me(), outOfTime]);
      if (id !== checkId.current) return;
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      if (id !== checkId.current) return;
      setUser(null);
      setIsAuthenticated(false);
      // No answer (rather than "not signed in"): say so, never the logged-out page.
      if (error?.unreachable) setAuthError({ type: 'unreachable' });
    } finally {
      clearTimeout(timer);
      if (id === checkId.current) {
        waiting.current = false;
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    }
  }, []);

  // When the page comes back into view (Safari showing a page it paused or
  // preloaded, or restoring it from its cache) while the check was still
  // waiting, its requests may never be answered: start again. Only then; a
  // page that had already finished its check is left alone.
  // A fresh page, not just a fresh check: after a hung sign-in refresh the
  // Supabase library holds on to the failure for a minute, so only a new page
  // starts truly fresh requests. Nothing is lost: the page was still waiting.
  useEffect(() => {
    const again = () => {
      if (waiting.current && document.visibilityState === 'visible') window.location.reload();
    };
    const onPageShow = (e) => { if (e.persisted) again(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [checkUserAuth]);

  // Reads the profile again without the full-screen loading state (e.g.
  // after you change your name).
  const refreshUser = async () => {
    const current = await base44.auth.me().catch(() => null);
    if (current) setUser(current);
    return current;
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.logout(shouldRedirect ? window.location.href : undefined);
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      refreshUser,
      checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
