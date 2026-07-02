import "./index.css";



export const metadata = {
  title: 'Glossa - Читалка с переводом',
  description: 'Читайте английские тексты с мгновенным переводом',
  manifest: '/manifest.json',
  themeColor: '#2b2420',
  icons:{
        icon: "/icon.png?v=1",
    },
  appleWebApp: {
    capable: true,
    title: 'Glossa',
    statusBarStyle: 'black-translucent',
  },
};

export default function RootLayout({ children }) {
    return (
    <html lang="ru">
    <body>{children}</body>
    </html>
    );
}