<script>
import { Icon } from '@iconify/vue'

export default {
  name: 'Categories',
  components: { Icon },
  props: {
    selected: { type: Array, default: () => [] }
  },
  emits: ['toggle'],
  data() {
    return {
      options: [
        'Trending',
        'Food and Drinks',
        'Beauty',
        'Fitness',
        'Arts & Craft',
        'Education',
        'Pets',
        'Others'
      ],
      // Mapping categories to Iconify icons
      icons: {
        'Food and Drinks': 'mdi:food',
        'Beauty': 'mdi:lipstick',
        'Fitness': 'mdi:run-fast',
        'Arts & Craft': 'mdi:brush',
        'Education': 'mdi:school',
        'Pets': 'mdi:paw',
        'Others': 'mdi:help-circle',
        'Trending': 'mdi:fire'
      }
    }
  },
  methods: {
    isActive(name) { return this.selected?.includes(name) },
    toggle(name) { this.$emit('toggle', name) }
  }
}
</script>

<template>
  <div class="container-fluid">
    <!-- Desktop: horizontal scrolling navbar -->
    <nav class="navbar d-none d-lg-flex">
      <div
        v-for="opt in options" :key="opt"
        class="category-wrapper"
      >
        <button
          type="button"
          class="navbar-brand category btn-reset"
          :class="{ active: isActive(opt), 'trending-category': opt === 'Trending' }"
          @click="toggle(opt)"
        >
          <!-- Use Iconify icon based on the category -->
          <Icon :icon="icons[opt]" class="category-icon" width="100" height="100" />
        </button>
        <div class="category-text text-center fs-5">{{ opt }}</div>
      </div>
    </nav>

    <!-- Mobile: 2 rows of 4 -->
    <div class="d-lg-none">
      <div class="row g-2 justify-content-center">
        <div
          v-for="opt in options" :key="opt"
          class="col-3"
        >
          <div class="category-wrapper-mobile">
            <button
              type="button"
              class="category btn-reset"
              :class="{ active: isActive(opt), 'trending-category': opt === 'Trending' }"
              @click="toggle(opt)"
            >
              <!-- Use Iconify icon based on the category -->
              <Icon :icon="icons[opt]" class="category-icon" width="50" height="50" />
            </button>
            <div class="category-text text-center">{{ opt }}</div>
          </div>
        </div>
      </div>
    </div>

    <hr />
  </div>
</template>


<style scoped>
hr { border: 1; opacity: 0.25; }

.btn-reset {
  background: none;
  border: 0;
  padding: 0;
}

/* Desktop styles */
.category-wrapper {
  display: inline-block;
  text-align: center;
}

/* Mobile grid styles */
.category-wrapper-mobile {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
}

.category {
  transition: transform var(--transition-fast);
  text-decoration: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  padding: 20px;
  border: 1px solid var(--color-border-dark);
  width: 120px;
  height: 120px;
  margin: 0 auto;
  background-color: var(--color-bg-primary);
}

.category img {
  width: 60%;
  height: 60%;
  border: none;
  object-fit: contain;
  transition: all var(--transition-fast);
  display: block;
}

:root.dark-mode .category img {
  filter: invert(1) brightness(1.2);
}

.category-icon {
  color: #000000;
  transition: all var(--transition-fast);
}

:root.dark-mode .category-icon {
  color: #ffffff !important;
}

:root.dark-mode .category {
  border-color: #e5e5e5;
}

.category:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}

:root.dark-mode .category:hover img {
  filter: invert(1) brightness(1);
}

.category.active {
  box-shadow: 0 0 0 4px var(--color-primary);
}

.category-text {
  color: var(--color-text-primary);
  margin-top: 8px;
}

.trending-icon {
  font-size: 50px;
  color: #333333;
  transition: all var(--transition-fast);
}

:root.dark-mode .trending-icon {
  color: #ffffff;
}

/* Mobile specific adjustments - 2 rows of 4 */
@media (max-width: 991.98px) {
  .category {
    width: 70px;
    height: 70px;
    padding: 12px;
  }

  .category-text {
    font-size: 0.65rem;
    margin-top: 10px;
    line-height: 1.1;
  }

  .category-wrapper-mobile {

    margin-top: 10px;
  }

  .container-fluid {
    padding-bottom: 24px;
  }

  .row.g-2 {
    row-gap: 1rem !important;
  }
}

@media (max-width: 575.98px) {
  .category {
    width: 65px;
    height: 65px;
    padding: 10px;
  }

  .category-text {
    font-size: 0.6rem;
    margin-top: 8px;
  }
}

@media (max-width: 380px) {
  .category {
    width: 55px;
    height: 55px;
    padding: 8px;
  }

  .category-text {
    font-size: 0.55rem;
    margin-top: 6px;
  }
}
</style>
