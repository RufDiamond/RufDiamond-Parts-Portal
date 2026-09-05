import Image from "next/image";
import styles from "./home.module.css";

/**
 * Home — slide 5.
 *
 * Copy and imagery are the deck's own. The destinations behind these cards,
 * the catalogue PDFs, the brochures and the news entries have to come from
 * RUFDiamond; until they do each card carries a visible note rather than a
 * dead link. See `clients.md`.
 */

const SOCIAL = [
  { name: "Instagram", icon: "/home/social-instagram.png", href: "#instagram", wide: false },
  { name: "Facebook", icon: "/home/social-facebook.png", href: "#facebook", wide: false },
  { name: "YouTube", icon: "/home/social-youtube.png", href: "#youtube", wide: true },
];

export default function HomePage() {
  return (
    <div className={styles.stage}>
      <section className={`${styles.card} ${styles.withIcon} ${styles.userGuide}`}>
        <div className={styles.body}>
          <h2 className={styles.title}>User guide</h2>
          <p className={styles.text}>
            Access this tab for help using the portal and performing searches.
          </p>
        </div>
        <Image
          src="/home/icon-guide.png"
          alt=""
          width={480}
          height={216}
          className={styles.icon}
          priority
        />
      </section>

      <section className={`${styles.card} ${styles.ordering}`}>
        <div className={styles.body}>
          <h2 className={`${styles.title} ${styles.titlePlain} ${styles.titleRight}`}>
            Parts Ordering Information
          </h2>
          <div className={styles.withIcon}>
            <p className={styles.text}>
              Please review these important recommendations before submitting
              your parts request.
            </p>
            <Image
              src="/home/icon-warning.png"
              alt=""
              width={480}
              height={480}
              className={styles.iconSmall}
            />
          </div>
        </div>
      </section>

      <section className={`${styles.card} ${styles.catalogs}`}>
        <div className={styles.body}>
          <h2 className={`${styles.title} ${styles.titleRight}`}>Parts catalogs</h2>
          <div className={`${styles.withIcon} ${styles.iconFirst}`}>
            <Image
              src="/home/icon-pdf.png"
              alt=""
              width={480}
              height={480}
              className={styles.iconSmall}
            />
            <p className={styles.text}>
              You may also access the PDF Parts Catalogues here.
            </p>
          </div>
        </div>
      </section>

      <section className={`${styles.card} ${styles.brochures}`}>
        <div className={styles.body}>
          <h2 className={styles.title}>Ruf Diamond brochures</h2>
          <div className={styles.withIcon}>
            <p className={styles.text}>
              You may also access general information about our equipment.
            </p>
            <Image
              src="/home/icon-brochure.png"
              alt=""
              width={256}
              height={256}
              className={styles.iconSmall}
            />
          </div>
        </div>
      </section>

      <section className={`${styles.card} ${styles.social}`}>
        <Image
          src="/home/social-promo.png"
          alt=""
          width={384}
          height={480}
          className={styles.promo}
        />
        <div className={styles.socialBody}>
          <h2 className={`${styles.title} ${styles.titleRight}`}>Social media</h2>
          <p className={`${styles.text} ${styles.textRight}`}>
            Stay up to date with our latest news
          </p>
          <p className={`${styles.text} ${styles.textRight}`}>
            Follow us on social media
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
                  width={360}
                  height={360}
                  className={`${styles.socialIcon} ${
                    item.wide ? styles.socialIconWide : ""
                  }`}
                />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.card} ${styles.news}`}>
        <h2 className={styles.title}>Ruf Diamond news</h2>
        <ul className={styles.newsList}>
          <li className={styles.newsItem}>
            <Image
              src="/home/news-1.png"
              alt=""
              width={360}
              height={480}
              className={`${styles.newsThumb} ${styles.newsThumbTall}`}
            />
            <p className={styles.newsHeadline}>IronHorse Catalogue 2026</p>
          </li>
          <li className={`${styles.newsItem} ${styles.newsItemFlip}`}>
            <p className={`${styles.newsHeadline} ${styles.textRight}`}>
              Sudbury college students design Arctic military toboggan
            </p>
            <Image
              src="/home/news-2.png"
              alt=""
              width={480}
              height={267}
              className={styles.newsThumb}
            />
          </li>
          <li className={styles.newsItem}>
            <Image
              src="/home/news-3.png"
              alt=""
              width={480}
              height={360}
              className={styles.newsThumb}
            />
            <p className={styles.newsHeadline}>
              Emergency Teams Rescue Patient in Remote Area with Innovative
              Drone Support
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}
