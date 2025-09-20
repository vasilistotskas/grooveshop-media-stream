export declare class CorsConfigDto {
    origin: string;
    methods: string;
    maxAge: number;
}
export declare class ServerConfigDto {
    port: number;
    host: string;
    cors: CorsConfigDto;
}
