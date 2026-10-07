class Logger {

    public static getInstance(): Console {
        return console
    }
}

export const logger = Logger.getInstance()
