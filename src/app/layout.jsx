import "./index.css";



export const metadata = {
  title: "Glossa Reader",
  description: "Приложение для чтения книг",
  
  icons: {
    // 1. Обычные иконки для вкладок Chrome/Safari на Mac (лучше всего размеры 32x32 и 16x16)
    icon: [
      { url: "/icon.png?v=1", sizes: "32x32", type: "image/png" },
      { url: "/icon.png?v=1", sizes: "16x16", type: "image/png" }
    ],
    // 2. Для закрепленных вкладок и старых версий macOS Safari
    shortcut: "/icon.png?v=1",
    // 3. Для iPhone, iPad и функции "Добавить в Док" (PWA) на macOS Sonoma и новее
    apple: {
      url: "/icon.png?v=1",
      sizes: "180x180",
      type: "image/png",
    },
  },
  
  appleWebApp: {
    capable: true,
    title: "Glossa",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }) {
    return (
    <html lang="ru">
    <body>{children}</body>
    </html>
    );
}