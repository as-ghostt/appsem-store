import { categories } from "../data/categories";

export default function CategoryTabs({ activeCategory, onChange }) {
  return (
    <section className="category-bar" aria-label="Categorías de apps">
      <div className="container category-scroll">
        {categories.map((category) => (
          <button
            className={`category-pill ${activeCategory === category.key ? "active" : ""}`}
            key={category.key}
            onClick={() => onChange(category.key)}
            type="button"
          >
            {category.label}
          </button>
        ))}
      </div>
    </section>
  );
}
