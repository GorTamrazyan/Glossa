import "./index.css";

export const metadata = {
    title: "Glossa",
    description: "Приложение для чтения и перевода слов",
    icons:{
        icon: "/icon.png?v=1",
    }
};
export default function RootLayout({ children }) {
    return (
    <html lang="ru">
    <body>{children}</body>
    </html>
    );
}