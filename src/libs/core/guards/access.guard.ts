import { CanActivate, ExecutionContext, Injectable, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToClass } from 'class-transformer';
import { Observable } from 'rxjs';
import { User } from '../entities/user.entity';
import { GroupsService } from '../services/groups.service';
import { TokenService } from '../services/token.service';
import { IAuthConfig, AUTH_CONFIG_TOKEN } from '../configs/auth.config';

@Injectable()
export class AccessGuard implements CanActivate {
    constructor(
        @Inject(AUTH_CONFIG_TOKEN) private readonly authConfig: IAuthConfig,
        private readonly reflector: Reflector,
        private readonly tokenService: TokenService,
        private readonly groupsService: GroupsService
    ) {
        groupsService.fullLoadAll();
    }
    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const roles = this.reflector.get<string[]>('roles', context.getHandler());
        const permissions = this.reflector.get<string[]>('permissions', context.getHandler());
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const authorizationHeader = request.headers.authorization ?
            String(request.headers.authorization) : null;

        if (roles && roles.length > 0 &&
            permissions && permissions.length > 0 &&
            authorizationHeader &&
            authorizationHeader.indexOf(this.authConfig.jwt.authHeaderPrefix) === 0) {
            let token =
                this.authConfig.jwt.authHeaderPrefix ?
                    authorizationHeader.split(this.authConfig.jwt.authHeaderPrefix)[1] :
                    authorizationHeader;
            token = token.trim();
            if (token && this.tokenService.verify(token)) {
                const data: any = this.tokenService.decode(token);
                request.user = plainToClass(User, data);
                request.user.groups = data.groups.map(group =>
                    this.groupsService.getGroupByName(group.name)
                );
            }
        }
        const hasRole = roles ? roles.filter(roleName =>
            request.user &&
            request.user[roleName]
        ).length > 0 : null;

        const hasPermission = permissions ?
            request.user &&
            request.user instanceof User &&
            request.user.checkPermissions(permissions) : null;
        return hasRole === true || hasPermission === true || (hasRole === null && hasPermission === null);
    }
}