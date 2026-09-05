import Image from "next/image";
import styles from "./home.module.css";

/**
 * Home — slide 5.
 *
 * The copy here is the deck's own. The destinations behind these cards, the
 * PDF catalogues, the brochures and the news entries all have to come from
 * RUFDiamond; until they do the cards carry a visible placeholder rather than
 * a dead link. See `clients.md`.
 */

const NEWS = [
  { image: "/home/news-1.png", headline: "IronHorse Catalogue 2026" },
  {
    image: "/home/news-2.png",
    headline: "Sudbury college students design Arctic military toboggan",
  },
  {
    image: "/home/news-3.png",
    headline:
      "Emergency teams rescue patient in remote area with innovative drone support",
  },
];

const SOCIAL = [
  { name: "LinkedIn", icon: "/home/social-linkedin.png", href: "#linkedin" },
  { name: "Instagram", icon: "/home/social-instagram.png", href: "#instagram" },
  { name: "Facebook", icon: "/home/social-facebook.png", href: "#facebook" },
  { name: "YouTube", icon: "/home/social-youtube.png", href: "#youtube" },
];

export default function HomePage() {
  return (
    <div className={styles.screen}>
      <div className={styles.column}>
        <section className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>User guide</h2>
            <p className={styles.cardText}>
              Access this tab for help using the portal and performing searches.
            </p>
            <p className={styles.placeholder}>Guide content to follow</p>
          </div>
          <Image
            src="/home/icon-guide.png"
            alt=""
            width={480}
            height={216}
            className={styles.cardIcon}
          />
        </section>

        <section className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>Parts catalogs</h2>
            <p className={styles.cardText}>
              You may also access the PDF Parts Catalogues here.
            </p>
            <p className={styles.placeholder}>Catalogue PDFs to follow</p>
          </div>
          <Image
            src="/home/icon-pdf.png"
            alt=""
            width={480}
            height={480}
            className={styles.cardIcon}
          />
        </section>

        <section className={styles.social}>
          <Image
            src="/home/social-promo.png"
            alt=""
            width={384}
            height={480}
            className={styles.socialPromo}
          />
          <div className={styles.socialBody}>
            <h2 className={styles.cardTitle}>Social media</h2>
            <p className={styles.cardText}>
              Stay up to date with our latest news. Follow us on social media.
            </p>
            <div className={styles.socialRow}>
              {SOCIAL.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className={styles.socialLink}
                  aria-label={item.name}
                >
                  <Image
                    src={item.icon}
                    alt=""
                    width={84}
                    height={84}
                    className={styles.socialIcon}
                  />
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className={styles.column}>
        <section className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={`${styles.cardTitle} ${styles.cardTitlePlain}`}>
              Parts Ordering Information
            </h2>
            <p className={styles.cardText}>
              Please review these important recommendations before submitting
              your parts request.
            </p>
            <p className={styles.placeholder}>Recommendations to follow</p>
          </div>
          <Image
            src="/home/icon-warning.png"
            alt=""
            width={128}
            height={128}
            className={styles.cardIcon}
          />
        </section>

        <section className={styles.card}>
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>Ruf Diamond brochures</h2>
            <p className={styles.cardText}>
              You may also access general information about our equipment.
            </p>
            <p className={styles.placeholder}>Brochures to follow</p>
          </div>
          <Image
            src="/home/icon-brochure.png"
            alt=""
            width={128}
            height={128}
            className={styles.cardIcon}
          />
        </section>

        <section className={styles.news}>
          <h2 className={styles.cardTitle}>Ruf Diamond news</h2>
          <ul className={styles.newsList}>
            {NEWS.map((item) => (
              <li key={item.headline} className={styles.newsItem}>
                <Image
                  src={item.image}
                  alt=""
                  width={220}
                  height={148}
                  className={styles.newsThumb}
                />
                <p className={styles.newsHeadline}>{item.headline}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
