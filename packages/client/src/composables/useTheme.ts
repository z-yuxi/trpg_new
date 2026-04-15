import { ref, watchEffect } from 'vue';

export type ThemeMode = 'day' | 'night';

const currentTheme = ref<ThemeMode>(
  (localStorage.getItem('theme') as ThemeMode) || 'day'
);

export function useTheme() {
  function setTheme(theme: ThemeMode): void {
    currentTheme.value = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  function toggleTheme(): void {
    setTheme(currentTheme.value === 'day' ? 'night' : 'day');
  }

  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme.value);
  });

  return { currentTheme, setTheme, toggleTheme };
}
