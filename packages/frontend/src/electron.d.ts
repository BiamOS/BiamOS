// Global type augmentation for Electron API exposed via preload
interface ElectronAPI {
    isElectron: boolean;
    platform: string;
    version: string;
    clearSession?: () => Promise<void>;
    /** Ghost-Auth: Scrape authenticated content using session cookies */
    scrapeUrl?: (url: string) => Promise<{ url: string; title: string; text: string }>;
    /** Autopilot: Execute a single step script in a hidden webview */
    executeAutopilotStep?: (url: string, script: string) => Promise<{ success: boolean; error?: string; text?: string }>;
    /** Autopilot: Get DOM snapshot for planning */
    getPageSnapshot?: (url: string) => Promise<{ url: string; text: string; title: string }>;
}

interface Window {
    electronAPI?: ElectronAPI;
}

// Electron <webview> element types
declare namespace JSX {
    interface IntrinsicElements {
        webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
            src?: string;
            autosize?: string;
            allowpopups?: string;
            partition?: string;
            preload?: string;
            nodeintegration?: string;
            disablewebsecurity?: string;
        };
    }
}
