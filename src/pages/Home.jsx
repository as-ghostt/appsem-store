import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Search, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import AppCard from "../components/AppCard";
import CategoryTabs from "../components/CategoryTabs";
import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import { categories, categoryMap } from "../data/categories";
import { getPublishedAppsPage } from "../services/appsService";
import { fallbackIcon, showFallbackAppIcon } from "../utils/appIconFallback.js";

const PAGE_SIZE = 24;


function formatNumber(value) {
  return new Intl.NumberFormat("es-PE", {
    notation: Number(value || 0) >= 10000 ? "compact" : "standard"
  }).format(value || 0);
}

function normalizeCategory(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function appMatchesCategory(app, category) {
  const aliases = {
    "books-reference": ["books-reference", "libros-referencias", "libros y referencias", "bible", "biblia", "biblias", "christian", "cristiana", "cristiano"],
    tools: ["tools", "herramienta", "herramientas"],
    education: ["education", "educacion"],
    entertainment: ["entertainment", "entretenimiento"],
    productivity: ["productivity", "productividad"],
    lifestyle: ["lifestyle", "estilo de vida"],
    games: ["games", "juego", "juegos"],
    other: ["other", "otros", "otro"]
  };

  const accepted = new Set([
    normalizeCategory(category.key),
    normalizeCategory(category.label),
    ...(aliases[category.key] || [])
  ]);

  return accepted.has(normalizeCategory(app.categoryKey)) || accepted.has(normalizeCategory(app.category));
}

function AppRowCard({ app, featured = false }) {
  const bannerStyle = app.bannerUrl ? { backgroundImage: `url(${app.bannerUrl})` } : undefined;

  return (
    <Link
      className={`home-row-app-card ${featured ? "home-row-app-card-featured" : "home-row-app-card-compact"}`}
      to={`/app/${app.slug}`}
      aria-label={`Ver detalles de ${app.title}`}
    >
      {featured ? <div className="home-row-app-banner" style={bannerStyle} aria-hidden="true" /> : null}
      <div className="home-row-app-body">
        <img src={app.iconUrl || fallbackIcon} alt={`Icono de ${app.title}`} loading="lazy" decoding="async" onError={showFallbackAppIcon} />
        <div className="home-row-app-copy">
          <strong>{app.title}</strong>
          <span>{categoryMap[app.categoryKey] || app.category || "App"}</span>
          <div className="home-row-app-meta">
            <small>★ {Number(app.ratingAverage || 0).toFixed(1)}</small>
            <small>{app.appSize || "—"}</small>
            <small><Download size={15} /> {formatNumber(app.downloadsCount)}</small>
          </div>
        </div>
      </div>
    </Link>
  );
}

function AppHorizontalSection({ title, apps, featured = false }) {
  if (!apps.length) return null;

  return (
    <section className={featured ? "home-promoted-row-section" : "home-app-row-section"}>
      <div className="home-section-heading"><h2>{title}</h2></div>
      <div className={`home-app-row ${featured ? "home-app-row-primary" : "home-app-row-compact"}`} aria-label={title}>
        {apps.map((app) => <AppRowCard app={app} featured={featured} key={app.id || app.slug} />)}
      </div>
    </section>
  );
}

export default function Home() {
  const [apps, setApps] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get("q") || "";
  const searchOpen = searchParams.get("search") === "1";

  useEffect(() => {
    let alive = true;

    getPublishedAppsPage({ pageSize: PAGE_SIZE })
      .then((page) => {
        if (!alive) return;
        setApps(page.apps);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch((err) => {
        console.error(err);
        if (alive) setError("No se pudieron cargar las apps. Revisa Firebase y los índices de Firestore.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  async function loadMoreApps() {
    if (!hasMore || !cursor || loadingMore) return;

    setLoadingMore(true);
    setError("");
    try {
      const page = await getPublishedAppsPage({ pageSize: PAGE_SIZE, cursor });
      setApps((current) => {
        const knownIds = new Set(current.map((app) => app.id));
        return [...current, ...page.apps.filter((app) => !knownIds.has(app.id))];
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar más aplicaciones. Inténtalo nuevamente.");
    } finally {
      setLoadingMore(false);
    }
  }

  const featuredApps = useMemo(
    () => apps.filter((app) => app.featured === true).slice(0, 8),
    [apps]
  );

  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return apps.filter((app) => [app.title, app.shortDescription, app.fullDescription, app.category]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term)));
  }, [apps, searchTerm]);

  const categorySections = useMemo(() => {
    const visible = categories.filter((category) => category.key !== "all");
    const selected = activeCategory === "all" ? visible : visible.filter((category) => category.key === activeCategory);
    return selected
      .map((category) => ({ ...category, apps: apps.filter((app) => appMatchesCategory(app, category)) }))
      .filter((category) => category.apps.length > 0);
  }, [apps, activeCategory]);

  function updateSearch(value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("q", value); else next.delete("q");
    setSearchParams(next, { replace: true });
  }

  function closeSearch() {
    const next = new URLSearchParams(searchParams);
    next.delete("search");
    next.delete("q");
    setSearchParams(next, { replace: true });
  }

  return (
    <>
      <CategoryTabs activeCategory={activeCategory} onChange={setActiveCategory} />
      <main className="container home-store-content">
        {loading ? <LoadingState text="Cargando apps publicadas..." /> : null}
        {error ? <div className="error-box">{error}</div> : null}

        {!loading && apps.length > 0 ? (
          <>
            {activeCategory === "all" && featuredApps.length > 0 ? (
              <AppHorizontalSection title="Apps destacadas" apps={featuredApps} featured />
            ) : null}

            <div className="home-category-sections">
              {categorySections.map((category) => (
                <AppHorizontalSection title={category.label} apps={category.apps} key={category.key} />
              ))}
            </div>

            {hasMore ? (
              <div className="catalog-pagination">
                <button className="primary-button" type="button" onClick={loadMoreApps} disabled={loadingMore}>
                  {loadingMore ? "Cargando..." : "Ver más aplicaciones"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {!loading && !error && apps.length === 0 ? (
          <EmptyState title="Aún no hay apps publicadas" message="Cuando publiques apps desde el panel admin aparecerán aquí automáticamente." />
        ) : null}
      </main>

      {searchOpen ? (
        <section className="app-search-overlay" aria-label="Buscar apps">
          <form className="app-search-topbar" onSubmit={(event) => event.preventDefault()} role="search">
            <button type="button" onClick={closeSearch} aria-label="Volver"><ArrowLeft size={24} /></button>
            <div className="app-search-input-wrap">
              <Search size={21} />
              <input autoFocus aria-label="Buscar apps" enterKeyHint="search" onChange={(event) => updateSearch(event.target.value)} placeholder="Buscar apps" type="search" value={searchTerm} />
            </div>
            <button type="button" onClick={() => updateSearch("")} aria-label="Borrar búsqueda" disabled={!searchTerm}><X size={24} /></button>
          </form>

          <div className="container app-search-results">
            {loading ? <LoadingState text="Cargando apps publicadas..." /> : null}
            {error ? <div className="error-box">{error}</div> : null}
            {!loading && !error && !searchTerm ? <p className="app-search-hint">Escribe el nombre o una palabra relacionada con la app.</p> : null}
            {!loading && !error && searchTerm && searchResults.length > 0 ? (
              <>
                <div className="app-search-results-heading"><strong>Resultados</strong><span>{searchResults.length}</span></div>
                <div className="apps-grid">{searchResults.map((app) => <AppCard app={app} key={app.id} />)}</div>
                {hasMore ? (
                  <div className="catalog-pagination catalog-pagination-search">
                    <button className="primary-button" type="button" onClick={loadMoreApps} disabled={loadingMore}>
                      {loadingMore ? "Buscando..." : "Buscar en más aplicaciones"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
            {!loading && !error && searchTerm && searchResults.length === 0 ? (
              <>
                <EmptyState title="No encontramos apps" message="Prueba con otro nombre o término de búsqueda." />
                {hasMore ? (
                  <div className="catalog-pagination catalog-pagination-search">
                    <button className="primary-button" type="button" onClick={loadMoreApps} disabled={loadingMore}>
                      {loadingMore ? "Buscando..." : "Buscar en más aplicaciones"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
