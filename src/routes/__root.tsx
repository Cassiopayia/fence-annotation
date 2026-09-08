import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CONTENT_SECURITY_POLICY } from "../lib/security-csp";
import { I18nProvider, useI18n } from "../i18n/context";
import { startViewportInsets } from "../lib/viewport-insets";

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {t("pageNotFound")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("pageNotFoundDesc")}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("thisPageDidntLoad")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("somethingWentWrong")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("tryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
        },
        { title: "fency" },
        {
          name: "description",
          content: "Annotate photovoltaic fence lines on aerial imagery.",
        },
        { name: "author", content: "fency" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "fency" },
        { name: "application-name", content: "fency" },
        { name: "mobile-web-app-capable", content: "yes" },
        {
          name: "apple-mobile-web-app-status-bar-style",
          content: "black-translucent",
        },
        { name: "theme-color", content: "#1a1f1c" },
        { property: "og:title", content: "fency" },
        {
          property: "og:description",
          content: "Annotate photovoltaic fence lines on aerial imagery.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        {
          httpEquiv: "Content-Security-Policy",
          content: CONTENT_SECURITY_POLICY,
        },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
        },
        {
          rel: "icon",
          href: `${import.meta.env.BASE_URL}favicon.ico`,
          type: "image/x-icon",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "32x32",
          href: `${import.meta.env.BASE_URL}favicon-32x32.png`,
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "16x16",
          href: `${import.meta.env.BASE_URL}favicon-16x16.png`,
        },
        {
          rel: "manifest",
          href: `${import.meta.env.BASE_URL}manifest.webmanifest`,
        },
        {
          rel: "apple-touch-icon",
          href: `${import.meta.env.BASE_URL}apple-touch-icon.png`,
        },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full bg-card">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone,h=window.innerHeight,sab=0,sat=0,vv=window.visualViewport;if(vv&&!s){sab=Math.max(0,window.innerHeight-vv.height-vv.offsetTop);h=Math.round(vv.height);}else if(s){sat=47;sab=34;}var r=document.documentElement;r.dataset.displayMode=s?"standalone":"browser";r.style.setProperty("--sat",sat+"px");r.style.setProperty("--sab",sab+"px");r.style.setProperty("--app-h",h+"px");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="h-full bg-card">
        <I18nProvider>{children}</I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => startViewportInsets(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-shell fixed top-0 left-0 right-0 w-full overflow-hidden bg-card">
        <Outlet />
      </div>
    </QueryClientProvider>
  );
}
